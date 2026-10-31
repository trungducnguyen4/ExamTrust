"use client";

import Link from "next/link";
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, usePathname } from "next/navigation";
import { DataPagination } from "@/components/common/DataPagination";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { SearchBar } from "@/components/common/list/SearchBar";
import { FilterPanel } from "@/components/common/list/FilterPanel";
import { SortButton, type SortOrder } from "@/components/common/list/SortButton";
import { ActiveFilterChips } from "@/components/common/list/ActiveFilterChips";
import { sortItems } from "@/components/common/list/sort-utils";
import {
  FilterDefinition,
  FilterValues,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge, getStatusBadgeLabel } from "@/components/ui/status-badge";
import { Progress } from "@/components/ui/progress";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Users,
  Clock,
  AlertTriangle,
  Shield,
  Eye,
  Globe,
  RefreshCw,
  QrCode,
  Monitor,
  Flag,
  BarChart3,
  CheckCircle2,
  XCircle,
  Activity,
  MousePointerClick,
  Camera,
  ImageOff,
  Image as ImageIcon,
  Sparkles,
  MoreHorizontal,
  History,
  Copy,
} from "lucide-react";
import { BackToDashboardButton } from "@/components/common/BackToDashboardButton";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import api, { API_BASE_URL, unwrapPaginatedData } from "@/lib/api";
import { INTEGRITY_EVENT_LABELS, getIntegrityEventLabel } from "@/lib/integrity-event-labels";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

interface StudentSession {
  id: string; // submission id when available, otherwise enrollment id
  submissionId: string | null;
  attemptNo: number | null;
  userId: string;
  name: string;
  studentId: string;
  status:
    | "in_progress"
    | "submitted"
    | "not_joined"
    | "flagged"
    | "disconnected";
  progress: number;
  score: number | null;
  tabSwitches: number;
  mouseAnomalies: number;
  integrityEvents: number;
  startedAt: string | null;
  submittedAt: string | null;
  // Raw ISO timestamp behind the human-formatted `submittedAt` above — kept
  // around so the "fast completion" alert below can sort by when the
  // submission actually happened instead of falling back to poll time.
  submittedAtRaw: string | null;
  timingSignal: {
    severity: "REVIEW" | "HIGH";
    elapsedMinutes: number;
    allowedMinutes: number;
    completionRatio: number;
    scorePct: number;
  } | null;
  flagReason: string | null;
  evidenceCount: number;
  evidenceUnreviewedCount: number;
  previousAttempts: Array<{
    submissionId: string;
    attemptNo: number | null;
    status: StudentSession["status"];
    score: number | null;
    submittedAt: string | null;
    tabSwitches: number;
    mouseAnomalies: number;
    integrityEvents: number;
    evidenceCount: number;
    evidenceUnreviewedCount: number;
  }>;
}

interface IntegrityAlert {
  id: string;
  submissionId: string | null;
  studentName: string;
  attemptNo?: number | null;
  type:
    | "tab_switch"
    | "fullscreen"
    | "camera"
    | "copy_paste"
    | "mouse"
    | "timing"
    | "other";
  label: string;
  message: string;
  severity: "low" | "warning" | "critical";
  time: string;
  timestampMs: number;
  hasEvidence?: boolean;
}

// tab_switch/mouse are aggregate running counters (one row per
// submission, message text like "Detected N tab switches") — the polled
// value always supersedes. Every other type is one row per discrete event.
// The realtime SSE stream, the per-event overview log, and the aggregate
// overview log each mint the alert's `id` differently (see
// submissions.service.ts: `${submissionId}-${eventType}-${ts}` vs `log.id`
// vs `tab-${proctoringId}`), so ids never line up across sources. Replacing
// the whole alerts array on every 10s poll (the old behavior) therefore
// silently erased whatever the realtime stream had just shown the instant a
// poll ran before the underlying DB write/aggregation caught up. Merging by
// submission+type instead keeps discrete-event alerts until something
// legitimately supersedes them, and always freshens aggregate counters.
const AGGREGATE_ALERT_TYPES = new Set<IntegrityAlert["type"]>(["tab_switch", "mouse"]);

function mergeIntegrityAlerts(existing: IntegrityAlert[], incoming: IntegrityAlert[]): IntegrityAlert[] {
  const merged = new Map<string, IntegrityAlert>();
  // Discrete (non-aggregate) alerts still need de-duping across sources: the
  // SSE push and the 10s REST poll both deliver the SAME underlying event
  // with DIFFERENT minted ids (see comment above), so an id-only key lets
  // both survive as separate rows. Bucketing by a 2s timestamp window
  // instead collapses same-submission/same-type alerts that land within a
  // couple seconds of each other — which in practice only happens when it's
  // the same event arriving twice, since two genuinely distinct discrete
  // violations of the same type are never observed that close together.
  const keyFor = (a: IntegrityAlert) =>
    AGGREGATE_ALERT_TYPES.has(a.type)
      ? `${a.submissionId || "unknown"}|${a.type}`
      : `${a.submissionId || "unknown"}|${a.type}|${Math.floor(a.timestampMs / 2000)}`;
  existing.forEach((a) => merged.set(keyFor(a), a));
  incoming.forEach((a) => merged.set(keyFor(a), a));
  // Alerts arrive from two async sources (10s poll + SSE) that can land
  // out of order relative to when the underlying event actually happened —
  // sort by the event's own timestamp, not insertion order, so the feed
  // reads chronologically regardless of which source last touched a row.
  return [...merged.values()]
    .sort((a, b) => b.timestampMs - a.timestampMs)
    .slice(0, 100);
}

interface EvidenceCapture {
  id: string;
  status: "REQUESTED" | "UPLOADED" | "ANALYZING" | "ANALYZED" | "FAILED" | "PURGED";
  trigger: "SCHEDULED" | "SUSPICIOUS_EVENT";
  captureSource?: "WEBCAM" | "SCREEN";
  triggerDetails?: unknown;
  scheduledSlot?: number | null;
  scheduledAt?: string | null;
  capturedAt?: string | null;
  createdAt: string;
  aiTags?: Array<{ tag?: string; confidence?: number; note?: string }> | null;
  aiProvider?: string | null;
  aiAnalyzedAt?: string | null;
  aiError?: string | null;
  reviewStatus?: "PENDING" | "REVIEWED" | "DISMISSED" | null;
  reviewerNote?: string | null;
  reviewedAt?: string | null;
}

// Labels a SCHEDULED capture by its position in the schedule — slot 0 is
// always the exam-start checkpoint, the highest slot seen is always the
// guaranteed end-of-exam checkpoint (see ProctoringEvidenceService), and
// anything in between is numbered by its own slot index (1, 2, 3...) so
// multiple mid-exam checkpoints don't all show up as one indistinguishable
// "Định kỳ" label.
function getEvidenceEventLabel(capture: EvidenceCapture, maxScheduledSlot?: number | null): string {
  if (capture.trigger === "SCHEDULED") {
    const slot = capture.scheduledSlot;
    if (slot === 0) return "Ảnh bắt đầu";
    if (slot != null && maxScheduledSlot != null && slot === maxScheduledSlot) return "Ảnh kết thúc";
    return slot != null ? `Định kỳ ${slot}` : "Định kỳ";
  }
  const details = capture.triggerDetails as { signals?: string[] } | null | undefined;
  const signal = details?.signals?.find((s) => INTEGRITY_EVENT_LABELS[s.toLowerCase()]);
  return signal ? getIntegrityEventLabel(signal) : "Sự kiện nghi vấn";
}

// Screen-capture (Part 5) isn't wired up yet, but when it is, the webcam +
// screen shots for one trigger are created back-to-back — bucketing by
// scheduledSlot (for SCHEDULED) or a small time window (for SUSPICIOUS_EVENT)
// pairs them without needing a dedicated group-id column.
function getEvidenceGroupKey(capture: EvidenceCapture): string {
  if (capture.scheduledSlot != null) return `scheduled-${capture.scheduledSlot}`;
  const bucket = Math.floor(new Date(capture.createdAt).getTime() / 5000);
  return `event-${capture.trigger}-${bucket}`;
}

type ExamOverview = {
  exam?: { totalPoints?: number };
  anomalies?: Array<{
    id: string;
    eventType: string;
    label?: string;
    details?: string;
    timestamp: string;
    severity: "low" | "medium" | "high";
    student?: { fullName?: string } | null;
    submissionId?: string | null;
    attemptNo?: number | null;
    hasEvidence?: boolean;
  }>;
};

const mapSubmissionStatus = (status?: string): StudentSession["status"] => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "IN_PROGRESS") return "in_progress";
  if (normalized === "SUBMITTED" || normalized === "GRADED") return "submitted";
  if (normalized === "FLAGGED") return "flagged";
  return "not_joined";
};

// Mirrors BE's getIntegrityEventCategory (submissions/integrity-event-catalog.ts)
// so the icon/bucket a lecturer sees here matches the category used for the
// "Tín hiệu" pattern breakdown on /lecturer/integrity — FE and BE can't share
// a TS module directly, so keep this logic in sync by hand if the BE catalog
// changes.
const mapEventTypeToAlertType = (
  eventType?: string,
): IntegrityAlert["type"] => {
  const key = String(eventType || "").toLowerCase();
  if (key === "tab_switch") return "tab_switch";
  if (key.startsWith("fullscreen") || key === "blur" || key === "window_blur" || key === "focus") return "fullscreen";
  if (key.startsWith("camera") || key.startsWith("screen_share") || key === "face_not_detected" || key === "multi_monitor_detected" || key === "multi_monitor_at_start") return "camera";
  if (key === "copy" || key === "paste" || key === "paste_external") return "copy_paste";
  if (key.startsWith("mouse")) return "mouse";
  return "other";
};

const EMPTY_STUDENT_FILTERS: FilterValues = {
  status: "all",
  riskLevel: "all",
};

const getRiskLevel = (session: StudentSession): "clean" | "watch" | "high" => {
  if (session.status === "flagged" || session.integrityEvents >= 5 || session.timingSignal?.severity === "HIGH") {
    return "high";
  }
  if (session.integrityEvents >= 2 || session.timingSignal?.severity === "REVIEW") {
    return "watch";
  }
  return "clean";
};

const STUDENTS_PER_PAGE = 10;

type SimilarAnswerMatch = {
  questionIdentity: string;
  questionId: string;
  orderIndex: number | null;
  letter: string;
  isCorrect: boolean;
};

interface SimilarAnswerPair {
  studentA: { submissionId: string; studentId: string; studentName: string; studentCode?: string | null };
  studentB: { submissionId: string; studentId: string; studentName: string; studentCode?: string | null };
  similarityScore: number;
  rareWrongMatches: number;
  comparableQuestions: number;
  matchedBreakdown: {
    total: number;
    correctMatches: SimilarAnswerMatch[];
    wrongMatches: SimilarAnswerMatch[];
  };
  severity: "REVIEW" | "HIGH";
}

interface FastCompletion {
  submissionId: string;
  studentId: string;
  studentName: string;
  studentCode?: string | null;
  severity: "REVIEW" | "HIGH";
  elapsedMinutes: number;
  allowedMinutes: number;
  completionRatio: number;
  scorePct: number;
  cohortMedianMinutes?: number | null;
}

type IntegritySignals = {
  fastCompletions: FastCompletion[];
  similarAnswerPairs: SimilarAnswerPair[];
};

export default function ExamMonitor() {
  const params = useParams();
  const slug = Array.isArray(params?.slug) ? params.slug : [];
  const routeId = (params as any)?.id;
  const id = Array.isArray(routeId) ? routeId[0] : routeId || slug[1];
  const pathname = usePathname();
  const basePath = pathname.startsWith("/admin")
    ? "/admin"
    : "/lecturer";
  const [students, setStudents] = useState<StudentSession[]>([]);
  const [alerts, setAlerts] = useState<IntegrityAlert[]>([]);
  const [examTitle, setExamTitle] = useState("Giám sát bài thi trực tiếp");
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedAlertIds, setResolvedAlertIds] = useState<Set<string>>(
    new Set(),
  );
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [draftFilters, setDraftFilters] = useState<FilterValues>(
    EMPTY_STUDENT_FILTERS,
  );
  const [appliedFilters, setAppliedFilters] = useState<FilterValues>(
    EMPTY_STUDENT_FILTERS,
  );
  const [sortField, setSortField] = useState("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [page, setPage] = useState(1);
  const [showScoreDialog, setShowScoreDialog] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [integritySignals, setIntegritySignals] = useState<IntegritySignals | null>(null);
  const [similarDetail, setSimilarDetail] = useState<SimilarAnswerPair | null>(null);
  const [historyDialogStudent, setHistoryDialogStudent] = useState<StudentSession | null>(null);
  const [lastRefresh, setLastRefresh] = useState(
    new Date().toLocaleTimeString(),
  );
  const eventSourceRef = useRef<EventSource | null>(null);

  const [riskFlags, setRiskFlags] = useState<any[]>([]);
  const [riskDialogSubmission, setRiskDialogSubmission] = useState<{ id: string; name: string } | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskResult, setRiskResult] = useState<any | null>(null);
  const [riskFlag, setRiskFlag] = useState<any | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [riskEligibility, setRiskEligibility] = useState<any | null>(null);
  const [riskEligibilityLoading, setRiskEligibilityLoading] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [evidenceDialogSubmission, setEvidenceDialogSubmission] = useState<{ id: string; name: string } | null>(null);
  const [evidenceCaptures, setEvidenceCaptures] = useState<EvidenceCapture[]>([]);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [evidenceImageUrls, setEvidenceImageUrls] = useState<Record<string, string>>({});
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceImageLoading, setEvidenceImageLoading] = useState(false);
  const [evidenceReviewLoading, setEvidenceReviewLoading] = useState(false);
  const [reanalyzingEvidenceId, setReanalyzingEvidenceId] = useState<string | null>(null);
  const [evidenceReviewNote, setEvidenceReviewNote] = useState("");
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [evidenceFilter, setEvidenceFilter] = useState<"all" | "suspicious" | "scheduled" | "webcam" | "screen" | "unreviewed">("all");

  const riskFlagsBySubmission = useMemo(() => {
    const map = new Map<string, any>();
    for (const flag of riskFlags) {
      const submissionId = flag?.job?.submissionId;
      if (submissionId && !map.has(submissionId)) {
        map.set(submissionId, flag);
      }
    }
    return map;
  }, [riskFlags]);

  const loadRiskFlags = async () => {
    if (!id) return;
    try {
      const flags = await api.listExamRiskFlags(id);
      setRiskFlags(flags || []);
    } catch {
      // Non-blocking: risk flags are supplementary to the core monitor view.
    }
  };

  const loadIntegritySignals = async () => {
    if (!id) return;
    try {
      const payload = (await api.getExamIntelligence(id)) as any;
      if (payload?.integritySignals) setIntegritySignals(payload.integritySignals);
    } catch {
      // Non-blocking: integrity signals are supplementary to the monitor view.
    }
  };

  const loadMonitorData = async (silent = false) => {
    if (!id) return;

    if (silent) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      setError(null);

      const [examRes, submissionsRes, overviewRes] = await Promise.all([
        api.getExam(id),
        api.getExamSubmissions(id, 1, 200),
        api.getExamOverview(id),
      ]);

      setExamTitle(examRes?.title || "Giám sát bài thi trực tiếp");

      const overview = (overviewRes || {}) as ExamOverview;
      const submissions = unwrapPaginatedData<any>(submissionsRes);

      const courseId = examRes?.courseId;
      let enrollments: any[] = [];
      if (courseId) {
        enrollments = await api.getCourseEnrollments(courseId);
      }

      // `submissions` comes back newest-first (BE orders by startedAt desc).
      // A student can have multiple attempts — keep ALL of them (one monitor
      // row per attempt) instead of collapsing to a single submission per
      // student, which previously made every earlier attempt's data
      // disappear/get overwritten by whichever one the dedup kept.
      const submissionsByStudentId = new Map<string, any[]>();
      for (const submission of submissions) {
        if (!submission?.student?.id) continue;
        const list = submissionsByStudentId.get(submission.student.id) || [];
        list.push(submission);
        submissionsByStudentId.set(submission.student.id, list);
      }

      const anomalyBySubmissionId = new Map<
        string,
        { tab: number; mouse: number; all: number }
      >();
      for (const anomaly of overview.anomalies || []) {
        if (!anomaly?.submissionId) continue;
        const current = anomalyBySubmissionId.get(anomaly.submissionId) || {
          tab: 0,
          mouse: 0,
          all: 0,
        };
        const event = String(anomaly.eventType || "").toLowerCase();
        current.all += 1;
        if (event.includes("tab")) current.tab += 1;
        if (event.includes("mouse")) current.mouse += 1;
        anomalyBySubmissionId.set(anomaly.submissionId, current);
      }

      const buildRow = (
        enrollment: any,
        submission: any | null,
        previousAttempts: StudentSession["previousAttempts"] = [],
      ): StudentSession => {
        const student = enrollment.student;
        const anomalyCount = submission?.id
          ? anomalyBySubmissionId.get(submission.id)
          : undefined;
        const status = submission
          ? mapSubmissionStatus(submission.status)
          : "not_joined";

        return {
          id: submission?.id || enrollment.id,
          submissionId: submission?.id || null,
          attemptNo: submission?.attemptNo ?? null,
          userId: student?.id || "",
          name: student?.fullName || "Sinh viên không xác định",
          studentId: student?.studentId || "-",
          status,
          progress:
            status === "submitted"
              ? 100
              : status === "in_progress"
                ? Math.max(
                    1,
                    Math.min(
                      99,
                      Number(submission?.answers?.length || 0) > 0
                        ? Math.round(
                            (Number(submission.answers.length) /
                              Math.max(1, Number(examRes?._count?.examQuestions || 1))) *
                              100,
                          )
                        : 1,
                    ),
                  )
                : 0,
          score: submission?.score ?? null,
          tabSwitches:
            anomalyCount?.tab || Number(submission?.proctoring?.tabSwitchCount || 0),
          mouseAnomalies:
            anomalyCount?.mouse || Number(submission?.proctoring?.mouseAnomalies || 0),
          integrityEvents:
            anomalyCount?.all ||
            Number(submission?.proctoring?.tabSwitchCount || 0) +
              Number(submission?.proctoring?.mouseAnomalies || 0),
          startedAt: submission?.startedAt
            ? new Date(submission.startedAt).toLocaleTimeString()
            : null,
          submittedAt: submission?.submittedAt
            ? new Date(submission.submittedAt).toLocaleTimeString()
            : null,
          submittedAtRaw: submission?.submittedAt || null,
          timingSignal: submission?.timingSignal || null,
          flagReason: status === "flagged" ? "Lượt nộp bị gắn cờ" : null,
          evidenceCount: Number(submission?.evidenceCaptureCount || 0),
          evidenceUnreviewedCount: Number(submission?.evidenceUnreviewedCount || 0),
          previousAttempts,
        };
      };

      // One row per student, showing their latest attempt — older attempts
      // are attached as `previousAttempts` for the history popover instead
      // of each getting their own row (that made the table grow/shuffle a
      // lot for students who retried, and buried everyone else further down
      // the page).
      const joinedRows: StudentSession[] = enrollments.map((enrollment) => {
        const studentSubmissions = enrollment.student?.id
          ? submissionsByStudentId.get(enrollment.student.id)
          : undefined;
        if (!studentSubmissions || studentSubmissions.length === 0) {
          return buildRow(enrollment, null);
        }
        const [latest, ...older] = studentSubmissions;
        // Reuse buildRow for each older attempt too, so the history dialog
        // shows the exact same tab-switch/evidence detail as the main row
        // instead of a stripped-down summary.
        const previousAttempts = older.map((submission) => {
          const built = buildRow(enrollment, submission);
          return {
            submissionId: submission.id as string,
            attemptNo: built.attemptNo,
            status: built.status,
            score: built.score,
            submittedAt: submission.submittedAt
              ? new Date(submission.submittedAt).toLocaleString()
              : null,
            tabSwitches: built.tabSwitches,
            mouseAnomalies: built.mouseAnomalies,
            integrityEvents: built.integrityEvents,
            evidenceCount: built.evidenceCount,
            evidenceUnreviewedCount: built.evidenceUnreviewedCount,
          };
        });
        return buildRow(enrollment, latest, previousAttempts);
      });

      setStudents(joinedRows);

      const mappedAlerts: IntegrityAlert[] = (overview.anomalies || []).map(
        (anomaly) => ({
          id: anomaly.id,
          submissionId: anomaly.submissionId || null,
          studentName: anomaly.student?.fullName || "Sinh viên không xác định",
          attemptNo: anomaly.attemptNo ?? null,
          type: mapEventTypeToAlertType(anomaly.eventType),
          label: anomaly.label || anomaly.eventType || "Sự kiện toàn vẹn học thuật",
          message: anomaly.details || "",
          severity:
            anomaly.severity === "high"
              ? "critical"
              : anomaly.severity === "low"
                ? "low"
                : "warning",
          time: new Date(anomaly.timestamp).toLocaleTimeString(),
          timestampMs: new Date(anomaly.timestamp).getTime(),
          hasEvidence: Boolean(anomaly.hasEvidence),
        }),
      );
      for (const session of joinedRows) {
        if (!session.submissionId || !session.timingSignal) continue;
        const timing = session.timingSignal;
        mappedAlerts.push({
          id: `fast-completion-${session.submissionId}`,
          submissionId: session.submissionId,
          studentName: session.name,
          type: "timing",
          label: "Hoàn thành bất thường nhanh",
          message: `Hoàn thành ${timing.elapsedMinutes}/${timing.allowedMinutes} phút · ${(timing.scorePct / 10).toFixed(1)}/10 điểm · nhanh hơn ${((1 - timing.completionRatio) * 100).toFixed(1)}% thời lượng cho phép. Cần giảng viên rà soát.`,
          severity: timing.severity === "HIGH" ? "critical" : "warning",
          time: session.submittedAt || "Đã nộp",
          // Sort by the actual submission time, not poll time — otherwise
          // this alert re-jumps to the top of the feed on every 10s refresh
          // even when nothing new happened.
          timestampMs: session.submittedAtRaw ? new Date(session.submittedAtRaw).getTime() : Date.now(),
        });
      }
      setAlerts((prev) => mergeIntegrityAlerts(prev, mappedAlerts));
      setLastRefresh(new Date().toLocaleTimeString());
      if (process.env.NODE_ENV !== "production") {
        console.debug("[exam-monitor] fetched", {
          examId: id,
          sessions: joinedRows.length,
          violations: mappedAlerts.length,
        });
      }
    } catch (err: any) {
      setError(err?.message || "Không thể tải dữ liệu giám sát");
    } finally {
      if (silent) {
        setIsRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadMonitorData(false);
    loadRiskFlags();
    loadIntegritySignals();
  }, [id]);

  const openRiskDialog = async (submissionId: string, studentName: string) => {
    setRiskDialogSubmission({ id: submissionId, name: studentName });
    setRiskError(null);
    setReviewNotes("");
    setRiskEligibility(null);
    setRiskEligibilityLoading(true);
    const existingFlag = riskFlagsBySubmission.get(submissionId);
    if (existingFlag) {
      setRiskFlag(existingFlag);
      setRiskResult(existingFlag.job?.output || null);
    } else {
      setRiskFlag(null);
      setRiskResult(null);
    }

    try {
      const eligibility = await api.getExamRiskAssessmentEligibility(submissionId);
      setRiskEligibility(eligibility);
      if (eligibility.existingAssessment?.status === "SUCCEEDED" && eligibility.existingAssessment.output) {
        setRiskResult(eligibility.existingAssessment.output);
      }
      if (eligibility.existingAssessment?.status === "FAILED" && eligibility.existingAssessment.errorMessage) {
        setRiskError(eligibility.existingAssessment.errorMessage);
      }
    } catch (err: any) {
      setRiskError(err?.message || "Không thể kiểm tra điều kiện đánh giá rủi ro.");
    } finally {
      setRiskEligibilityLoading(false);
    }
  };

  const closeRiskDialog = () => {
    setRiskDialogSubmission(null);
    setRiskResult(null);
    setRiskFlag(null);
    setRiskError(null);
    setRiskEligibility(null);
    setRiskEligibilityLoading(false);
  };

  const openEvidenceDialog = async (submissionId: string, studentName: string) => {
    setEvidenceDialogSubmission({ id: submissionId, name: studentName });
    setEvidenceCaptures([]);
    setSelectedEvidenceId(null);
    setEvidenceReviewNote("");
    setEvidenceError(null);
    setEvidenceFilter("all");
    setEvidenceLoading(true);
    try {
      const captures = (await api.getEvidenceCaptures(submissionId)) as EvidenceCapture[];
      setEvidenceCaptures(captures);
      const firstAvailable = captures.find((capture) => capture.status !== "REQUESTED" && capture.status !== "PURGED");
      setSelectedEvidenceId(firstAvailable?.id || captures[0]?.id || null);
    } catch (err: any) {
      setEvidenceError(err?.message || "Không thể tải bằng chứng camera.");
    } finally {
      setEvidenceLoading(false);
    }
  };

  const closeEvidenceDialog = () => {
    Object.values(evidenceImageUrls).forEach((url) => URL.revokeObjectURL(url));
    setEvidenceDialogSubmission(null);
    setEvidenceCaptures([]);
    setSelectedEvidenceId(null);
    setEvidenceImageUrls({});
    setEvidenceReviewNote("");
    setEvidenceError(null);
    setEvidenceFilter("all");
  };

  const selectedEvidence = evidenceCaptures.find((capture) => capture.id === selectedEvidenceId) || null;

  // Single source of truth for the note textarea. Previously this was only
  // set from the thumbnail's own onClick handler, so the auto-selected first
  // capture (openEvidenceDialog, above) left it blank — the saved note only
  // appeared after manually re-clicking the same thumbnail, making it look
  // unsaved on first open.
  useEffect(() => {
    setEvidenceReviewNote(selectedEvidence?.reviewerNote || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvidenceId]);

  const maxScheduledSlot = useMemo(() => {
    const slots = evidenceCaptures
      .filter((c) => c.trigger === "SCHEDULED" && c.scheduledSlot != null)
      .map((c) => c.scheduledSlot as number);
    return slots.length ? Math.max(...slots) : null;
  }, [evidenceCaptures]);

  const filteredEvidenceCaptures = useMemo(() => {
    return evidenceCaptures.filter((capture) => {
      switch (evidenceFilter) {
        case "suspicious":
          return capture.trigger === "SUSPICIOUS_EVENT";
        case "scheduled":
          return capture.trigger === "SCHEDULED";
        case "webcam":
          return (capture.captureSource || "WEBCAM") === "WEBCAM";
        case "screen":
          return capture.captureSource === "SCREEN";
        case "unreviewed":
          return !capture.reviewStatus || capture.reviewStatus === "PENDING";
        default:
          return true;
      }
    });
  }, [evidenceCaptures, evidenceFilter]);

  const evidenceGroups = useMemo(() => {
    const map = new Map<string, EvidenceCapture[]>();
    filteredEvidenceCaptures.forEach((capture) => {
      const key = getEvidenceGroupKey(capture);
      const list = map.get(key) || [];
      list.push(capture);
      map.set(key, list);
    });
    return [...map.values()]
      .map((items) => [...items].sort((a, b) => (a.captureSource === "SCREEN" ? 1 : -1)))
      .sort((a, b) => new Date(a[0].createdAt).getTime() - new Date(b[0].createdAt).getTime());
  }, [filteredEvidenceCaptures]);

  // Thumbnails need the actual image up front (not just on click) — capture
  // volume is capped low by policy (see plan doc), so loading them all when
  // the dialog opens is cheap enough to skip a lazy/on-scroll loader.
  useEffect(() => {
    if (!evidenceDialogSubmission) return;
    const pending = evidenceCaptures.filter(
      (capture) => capture.status !== "REQUESTED" && capture.status !== "PURGED" && !evidenceImageUrls[capture.id],
    );
    if (pending.length === 0) return;
    let active = true;
    setEvidenceImageLoading(true);
    Promise.all(
      pending.map((capture) =>
        api
          .getEvidenceImageUrl(evidenceDialogSubmission.id, capture.id)
          .then((url) => ({ id: capture.id, url }))
          .catch(() => null),
      ),
    )
      .then((results) => {
        if (!active) return;
        setEvidenceImageUrls((current) => {
          const next = { ...current };
          for (const result of results) if (result) next[result.id] = result.url;
          return next;
        });
      })
      .finally(() => active && setEvidenceImageLoading(false));
    return () => { active = false; };
  }, [evidenceDialogSubmission, evidenceCaptures]);

  const reviewEvidence = async (reviewStatus: "REVIEWED" | "DISMISSED") => {
    if (!evidenceDialogSubmission || !selectedEvidence) return;
    // A webcam shot and its paired screen shot are two captures for the SAME
    // triggering event (same evidenceGroups bucket the thumbnail list already
    // shows them under) — reviewing just the one currently open left its pair
    // permanently "chưa rà soát", forcing a separate review per half of every
    // pair. Apply the same status/note to the whole group instead.
    const group = evidenceGroups.find((g) => g.some((capture) => capture.id === selectedEvidence.id)) || [selectedEvidence];
    setEvidenceReviewLoading(true);
    try {
      const reviewerNote = evidenceReviewNote.trim() || undefined;
      const updates = await Promise.all(
        group.map((capture) =>
          api.reviewEvidenceCapture(evidenceDialogSubmission.id, capture.id, { reviewStatus, reviewerNote }),
        ),
      );
      setEvidenceCaptures((current) => current.map((capture) => {
        const updated = updates.find((item) => item.id === capture.id);
        return updated ? { ...capture, ...updated } : capture;
      }));
      toast.success(reviewStatus === "REVIEWED" ? "Đã đánh dấu bằng chứng (webcam + màn hình) là đã rà soát." : "Đã bỏ qua bằng chứng này (webcam + màn hình).");
    } catch (err: any) {
      toast.error(err?.message || "Không thể cập nhật trạng thái rà soát.");
    } finally {
      setEvidenceReviewLoading(false);
    }
  };

  const formatEvidenceTime = (value?: string | null) => value ? new Date(value).toLocaleString("vi-VN") : "Chưa có";

  // Analysis runs async on the AI queue worker — there is no push channel for
  // this one capture, so after triggering a retry we short-poll the capture
  // list until this specific capture leaves ANALYZING (or we give up).
  const reanalyzeEvidence = async (captureId: string) => {
    if (!evidenceDialogSubmission) return;
    setReanalyzingEvidenceId(captureId);
    try {
      await api.reanalyzeEvidenceCapture(evidenceDialogSubmission.id, captureId);
      setEvidenceCaptures((current) => current.map((capture) => capture.id === captureId ? { ...capture, status: "ANALYZING", aiError: null } : capture));
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const captures = await api.getEvidenceCaptures(evidenceDialogSubmission.id);
        const updated = Array.isArray(captures) ? captures.find((item: EvidenceCapture) => item.id === captureId) : null;
        if (updated) setEvidenceCaptures((current) => current.map((capture) => capture.id === captureId ? { ...capture, ...updated } : capture));
        if (updated && updated.status !== "ANALYZING") break;
      }
    } catch (err: any) {
      toast.error(err?.message || "Không thể phân tích lại ảnh bằng chứng.");
    } finally {
      setReanalyzingEvidenceId(null);
    }
  };

  const handleGenerateRisk = async () => {
    if (!riskDialogSubmission || !riskEligibility?.eligible) return;
    setRiskLoading(true);
    setRiskError(null);
    try {
      const job = await api.generateExamRiskAssessment(riskDialogSubmission.id);
      setRiskResult(job?.output || null);
      setRiskFlag(job?.flag || null);
      await loadRiskFlags();
    } catch (err: any) {
          setRiskError(err?.message || "Không thể tạo đánh giá dấu hiệu rủi ro.");
    } finally {
      setRiskLoading(false);
    }
  };

  const handleReviewFlag = async (status: "REVIEWED" | "DISMISSED" | "CONFIRMED") => {
    if (!riskFlag?.id) return;
    try {
      const updated = await api.reviewExamRiskFlag(riskFlag.id, {
        status,
        notes: reviewNotes.trim() || undefined,
      });
      setRiskFlag((prev: any) => ({ ...prev, ...updated }));
      await loadRiskFlags();
      toast.success(
        status === "CONFIRMED"
          ? "Đã đánh dấu cần điều tra thêm."
          : status === "DISMISSED"
            ? "Đã bỏ qua cảnh báo."
            : "Đã đánh dấu cảnh báo là đã rà soát.",
      );
    } catch (err: any) {
      toast.error(err?.message || "Không thể cập nhật trạng thái rà soát cảnh báo.");
    }
  };

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadMonitorData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, id]);

  // Once nobody is still taking the exam, there's nothing left to poll for —
  // switch to manual so the page stops silently reloading data underneath a
  // lecturer who's still reviewing it. The screen itself stays fully usable
  // (not hidden/blocked) since reviewing after the fact is exactly what this
  // page is for; a manual "Làm mới" refresh is still one click away.
  useEffect(() => {
    if (!autoRefresh || students.length === 0) return;
    if (students.some((s) => s.status === "in_progress")) return;
    setAutoRefresh(false);
    toast.info("Không còn sinh viên nào đang làm bài — đã chuyển sang chế độ làm mới thủ công.");
  }, [autoRefresh, students]);

  useEffect(() => {
    if (!id) return;
    const token = api.getToken();
    if (!token) return;

    const streamUrl = `${API_BASE_URL}/submissions/exam/${encodeURIComponent(id)}/events?token=${encodeURIComponent(token)}`;
    const source = new EventSource(streamUrl);
    eventSourceRef.current = source;

    const onIntegrity = (evt: MessageEvent) => {
      try {
        const data = JSON.parse(evt.data || "{}");
        const eventType = String(data?.eventType || "unknown");
        const alertType = mapEventTypeToAlertType(eventType);
        const timestampMs = data?.timestamp ? new Date(data.timestamp).getTime() : Date.now();
        const mapped: IntegrityAlert = {
          id: String(data?.id || `${Date.now()}-${Math.random()}`),
          submissionId: data?.submissionId || null,
          studentName: data?.student?.fullName || "Sinh viên không xác định",
          attemptNo: data?.attemptNo ?? null,
          type: alertType,
          label: data?.label || eventType || "Sự kiện toàn vẹn học thuật",
          message: data?.details || "",
          severity:
            data?.severity === "high"
              ? "critical"
              : data?.severity === "low"
                ? "low"
                : "warning",
          time: new Date(timestampMs).toLocaleTimeString(),
          timestampMs,
        };

        setAlerts((prev) => mergeIntegrityAlerts(prev, [mapped]));

        if (mapped.submissionId) {
          setStudents((prev) =>
            prev.map((s) => {
              if (s.submissionId !== mapped.submissionId) return s;
              const next = { ...s };
              if (alertType === "tab_switch") {
                next.tabSwitches += 1;
                next.integrityEvents += 1;
              }
              if (alertType === "mouse") {
                next.mouseAnomalies += 1;
                next.integrityEvents += 1;
              }
              return next;
            }),
          );
        }
      } catch (e) {
        console.error("Failed to parse realtime integrity event", e);
      }
    };

    source.addEventListener("integrity", onIntegrity as EventListener);
    source.onerror = () => {
      // keep existing polling as fallback; EventSource auto-reconnects
      console.warn(
        "Realtime stream disconnected, fallback polling is still active.",
      );
    };

    return () => {
      source.removeEventListener("integrity", onIntegrity as EventListener);
      source.close();
      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }
    };
  }, [id]);

  const studentFilterDefinitions: FilterDefinition[] = useMemo(
    () => [
      {
        key: "status",
        label: "Trạng thái",
        type: "select",
        allLabel: "Tất cả trạng thái",
        options: [
          { label: "Đang làm bài", value: "in_progress" },
          { label: "Đã nộp", value: "submitted" },
          { label: "Bị gắn cờ", value: "flagged" },
          { label: "Chưa tham gia", value: "not_joined" },
          { label: "Mất kết nối", value: "disconnected" },
        ],
      },
      {
        key: "riskLevel",
        label: "Mức độ rủi ro",
        type: "select",
        allLabel: "Tất cả mức rủi ro",
        options: [
          { label: "Bình thường", value: "clean" },
          { label: "Cần theo dõi", value: "watch" },
          { label: "Cao", value: "high" },
        ],
      },
    ],
    [],
  );

  const normalizedSearch = appliedSearch.trim().toLowerCase();
  const sortedStudents = useMemo(() => {
    const statusValue = appliedFilters.status as string | undefined;
    const riskValue = appliedFilters.riskLevel as string | undefined;

    const filtered = students.filter((student) => {
      const matchSearch = !normalizedSearch
        ? true
        : [student.name, student.studentId]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);
      const matchStatus =
        !statusValue || statusValue === "all" || student.status === statusValue;
      const matchRisk =
        !riskValue || riskValue === "all"
          ? true
          : getRiskLevel(student) === riskValue;

      return matchSearch && matchStatus && matchRisk;
    });

    return sortItems(filtered, sortField, sortOrder);
  }, [appliedFilters, normalizedSearch, sortField, sortOrder, students]);

  const totalPages = Math.max(
    1,
    Math.ceil(sortedStudents.length / STUDENTS_PER_PAGE),
  );

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const paginatedStudents = useMemo(() => {
    const start = (page - 1) * STUDENTS_PER_PAGE;
    return sortedStudents.slice(start, start + STUDENTS_PER_PAGE);
  }, [page, sortedStudents]);

  const runSearch = () => {
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
    setPage(1);
  };

  const clearFilters = () => {
    setDraftFilters(EMPTY_STUDENT_FILTERS);
    setAppliedFilters(EMPTY_STUDENT_FILTERS);
    setSearchInput("");
    setAppliedSearch("");
    setPage(1);
  };

  const removeFilter = (key: string) => {
    const nextFilters = { ...appliedFilters, [key]: EMPTY_STUDENT_FILTERS[key] };
    setAppliedFilters(nextFilters);
    setDraftFilters(nextFilters);
    setPage(1);
  };

  const activeFilterCount = getActiveFilterCount(
    appliedFilters,
    studentFilterDefinitions,
  );
  const activeFilterChips = getFilterChips(
    appliedFilters,
    studentFilterDefinitions,
  );

  const studentSortOptions = [
    { field: "name", label: "Họ tên" },
    { field: "studentId", label: "Mã sinh viên" },
    { field: "status", label: "Trạng thái" },
    { field: "progress", label: "Tiến độ" },
    { field: "tabSwitches", label: "Số lần đổi tab" },
    { field: "mouseAnomalies", label: "Bất thường chuột" },
    { field: "integrityEvents", label: "Sự kiện toàn vẹn" },
  ];

  const stats = {
    total: students.length,
    inProgress: students.filter((s) => s.status === "in_progress").length,
    submitted: students.filter((s) => s.status === "submitted").length,
    flagged: students.filter((s) => s.status === "flagged").length,
    notJoined: students.filter((s) => s.status === "not_joined").length,
    disconnected: students.filter((s) => s.status === "disconnected").length,
  };

  const unresolvedAlerts = useMemo(
    () => alerts.filter((a) => !resolvedAlertIds.has(a.id)),
    [alerts, resolvedAlertIds],
  );

  const resolveAlert = (alertId: string) => {
    setResolvedAlertIds((prev) => new Set(prev).add(alertId));
  };

  const flagStudent = async (submissionId: string, reason: string) => {
    if (!submissionId) return;
    try {
      await api.updateSubmissionStatus(submissionId, "FLAGGED");
      await loadMonitorData(true);
      setStudents((prev) =>
        prev.map((s) =>
          s.submissionId === submissionId
            ? { ...s, status: "flagged", flagReason: reason }
            : s,
        ),
      );
    } catch (err) {
      console.error("Failed to flag submission", err);
    }
  };

  // Score distribution chart
  const submittedScores = students
    .filter((s) => s.score !== null)
    .map((s) => s.score!);
  const chartData = {
    labels: ["0-2", "2-4", "4-6", "6-8", "8-10"],
    datasets: [
      {
        label: "Sinh viên",
        data: [
          submittedScores.filter((s) => s <= 2).length,
          submittedScores.filter((s) => s > 2 && s <= 4).length,
          submittedScores.filter((s) => s > 4 && s <= 6).length,
          submittedScores.filter((s) => s > 6 && s <= 8).length,
          submittedScores.filter((s) => s > 8).length,
        ],
        backgroundColor: "rgba(37, 99, 235, 0.7)",
        borderRadius: 4,
      },
    ],
  };

  // Sized/colored to sit inside the status badge itself (h-3 w-3, no
  // hardcoded color) rather than as a separate sibling element — a
  // differently-colored icon (blue/green/red) next to a badge with its own
  // tone color is what made this column look busy/mismatched. Using
  // currentColor lets the icon inherit whatever text tone the badge applies.
  const statusIcon = (status: StudentSession["status"]) => {
    switch (status) {
      case "in_progress": return <Activity className="h-3 w-3" />;
      case "submitted": return <CheckCircle2 className="h-3 w-3" />;
      case "not_joined": return <Clock className="h-3 w-3" />;
      case "flagged": return <Flag className="h-3 w-3" />;
      case "disconnected": return <XCircle className="h-3 w-3" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        <BackToDashboardButton to={basePath} className="mb-4 -ml-2" />

        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-1">
              {examTitle}
              <span className="ml-3 text-sm font-normal text-muted-foreground">
                (Bài thi #{id})
              </span>
            </h1>
            <p className="text-muted-foreground">
              Theo dõi thời gian thực phiên làm bài của sinh viên, cảnh báo tính toàn vẹn và phân bố điểm số
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div
              className={`h-2 w-2 rounded-full ${autoRefresh ? "bg-green-500 animate-pulse" : "bg-muted"}`}
            />
            <span>Cập nhật lần cuối: {lastRefresh}</span>
            <Loader2
              className={`h-4 w-4 animate-spin ${isRefreshing ? "opacity-100" : "opacity-0"}`}
              aria-hidden={!isRefreshing}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="gap-1"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${autoRefresh ? "animate-spin" : ""}`}
              />
              {autoRefresh ? "Tự động" : "Thủ công"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                loadMonitorData(true);
                loadIntegritySignals();
              }}
              className="gap-1"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Làm mới
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`${basePath}/exam/${id}/qr`} className="gap-1">
                <QrCode className="h-3.5 w-3.5" /> Hiện mã QR
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowScoreDialog(true)}
              className="gap-1"
            >
              <BarChart3 className="h-3.5 w-3.5" /> Phân bố điểm
            </Button>
          </div>
        </div>

        {error && (
          <Card className="mb-4 border-red-200">
            <CardContent className="pt-4 text-sm text-red-600">
              {error}
            </CardContent>
          </Card>
        )}

        {loading && (
          <Card className="mb-4">
            <CardContent className="pt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải dữ liệu
              giám sát...
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-6 gap-3 mb-6">
          <Card>
            <CardContent className="pt-3 pb-3 text-center">
              <Users className="h-5 w-5 text-primary mx-auto mb-1" />
              <p className="text-xl font-semibold">{stats.total}</p>
              <p className="text-[10px] text-muted-foreground">Tổng số</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3 text-center">
              <Activity className="h-5 w-5 text-blue-600 mx-auto mb-1" />
              <p className="text-xl font-semibold text-blue-600">
                {stats.inProgress}
              </p>
              <p className="text-[10px] text-muted-foreground">Đang làm</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3 text-center">
              <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto mb-1" />
              <p className="text-xl font-semibold text-green-600">
                {stats.submitted}
              </p>
              <p className="text-[10px] text-muted-foreground">Đã nộp</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3 text-center">
              <Flag className="h-5 w-5 text-red-600 mx-auto mb-1" />
              <p className="text-xl font-semibold text-red-600">
                {stats.flagged}
              </p>
              <p className="text-[10px] text-muted-foreground">Gắn cờ</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3 text-center">
              <Clock className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
              <p className="text-xl font-semibold">{stats.notJoined}</p>
              <p className="text-[10px] text-muted-foreground">Chưa vào</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 pb-3 text-center">
              <XCircle className="h-5 w-5 text-yellow-600 mx-auto mb-1" />
              <p className="text-xl font-semibold text-yellow-600">
                {stats.disconnected}
              </p>
              <p className="text-[10px] text-muted-foreground">Mất kết nối</p>
            </CardContent>
          </Card>
        </div>

        {/* Integrity Alerts */}
        {unresolvedAlerts.length > 0 && (
          <Card className="mb-6 border-red-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-4 w-4" />
                Cảnh báo toàn vẹn ({unresolvedAlerts.length} chưa xử lý)
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-96 space-y-2 overflow-y-auto">
              {unresolvedAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    alert.severity === "critical"
                      ? "border-red-300 bg-red-50"
                      : alert.severity === "warning"
                        ? "border-yellow-300 bg-yellow-50"
                        : "border-blue-300 bg-blue-50"
                  }`}
                >
                  <div className="flex min-w-0 max-w-[80%] items-center gap-3">
                    {/* shrink-0 is load-bearing here: without it, a very long
                        message (e.g. a full pasted code blob for a paste_external
                        event) forces the flex row to shrink ALL children to fit,
                        including these fixed-size icon SVGs — they'd render as a
                        barely-visible sliver instead of a normal icon. */}
                    {alert.type === "tab_switch" && <Eye className="h-4 w-4 shrink-0" />}
                    {(alert.type === "camera" || alert.type === "other") && (
                      <Shield className="h-4 w-4 shrink-0" />
                    )}
                    {alert.type === "copy_paste" && <Copy className="h-4 w-4 shrink-0" />}
                    {alert.type === "mouse" && (
                      <MousePointerClick className="h-4 w-4 shrink-0" />
                    )}
                    {alert.type === "fullscreen" && (
                      <Monitor className="h-4 w-4 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 items-center">
                        <span className="min-w-0 truncate text-sm font-medium">
                          {alert.studentName}
                          {alert.attemptNo != null && (
                            <span className="ml-1">· Lượt {alert.attemptNo}</span>
                          )}
                        </span>
                        <span className="ml-1 shrink-0 text-sm font-medium">
                          · {alert.time}
                        </span>
                      </p>
                      <p
                        className="truncate text-xs text-muted-foreground"
                        title={`${alert.label}${alert.message && alert.message !== alert.label ? ` — ${alert.message}` : ""}`}
                      >
                        {alert.label}
                        {alert.message && alert.message !== alert.label
                          ? ` — ${alert.message}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={alert.severity}
                      domain="severity"
                    />
                    {alert.submissionId && alert.hasEvidence && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEvidenceDialog(alert.submissionId as string, alert.studentName)}
                      >
                        <Camera className="mr-1 h-3.5 w-3.5" />
                        Xem camera
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => resolveAlert(alert.id)}
                    >
                      Đã xử lý
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Tín hiệu toàn vẹn: làm bài nhanh + mẫu trả lời giống nhau */}
        <Card className="mb-6 border-amber-200/70">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Tín hiệu toàn vẹn
            </CardTitle>
            <CardDescription className="mt-1">
              Hoàn thành nhanh bất thường và mẫu trả lời trùng nhau là tín hiệu để giảng viên rà soát, không phải kết luận gian lận.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Làm bài nhanh bất thường</h3>
                <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                  {(integritySignals?.fastCompletions || []).length} cần xem xét
                </Badge>
              </div>
              {(integritySignals?.fastCompletions || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có bài hoàn tất nhanh bất thường đủ điều kiện cảnh báo.</p>
              ) : (
                <div className="divide-y divide-border/70 rounded-md border border-border/70">
                  {integritySignals!.fastCompletions.map((item) => (
                    <div key={item.submissionId} className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {item.studentName}
                          {item.studentCode ? <span className="ml-1 text-xs text-muted-foreground">{item.studentCode}</span> : null}
                          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${item.severity === "HIGH" ? "bg-red-100 text-red-700 border border-red-200" : "bg-amber-100 text-amber-700 border border-amber-200"}`}>
                            {item.severity === "HIGH" ? "Rủi ro cao" : "Cần xem xét"}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {item.elapsedMinutes} phút / {item.allowedMinutes} phút · {(item.scorePct / 10).toFixed(1)}/10 điểm · nhanh hơn {((1 - item.completionRatio) * 100).toFixed(1)}% thời lượng cho phép
                          {item.cohortMedianMinutes != null ? ` · Trung vị lớp ${item.cohortMedianMinutes} phút` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="border-t border-border/70 pt-5">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Mẫu trả lời giống nhau bất thường</h3>
                <Badge variant="outline" className="border-border bg-muted/40 text-muted-foreground">
                  {(integritySignals?.similarAnswerPairs || []).length} cặp
                </Badge>
              </div>
              {(integritySignals?.similarAnswerPairs || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có cặp bài làm đủ bằng chứng đáp án sai hiếm trùng nhau.</p>
              ) : (
                <div className="divide-y divide-border/70 rounded-md border border-border/70">
                  {integritySignals!.similarAnswerPairs.map((pair) => (
                    <div key={`${pair.studentA.submissionId}-${pair.studentB.submissionId}`} className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {pair.studentA.studentName} ↔ {pair.studentB.studentName}
                          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${pair.severity === "HIGH" ? "bg-red-100 text-red-700 border border-red-200" : "bg-amber-100 text-amber-700 border border-amber-200"}`}>
                            {pair.severity === "HIGH" ? "Rủi ro cao" : "Cần xem xét"}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {pair.rareWrongMatches} đáp án sai hiếm trùng nhau · {pair.comparableQuestions} câu so sánh · tương đồng {pair.similarityScore.toFixed(1)}%
                        </p>
                      </div>
                      <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setSimilarDetail(pair)}>
                        <Eye className="h-3.5 w-3.5" /> Xem chi tiết câu
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </CardContent>
        </Card>

        <div className="mb-6 space-y-3">
          <div className="rounded-xl border border-border bg-card p-2 sm:p-2.5 shadow-sm flex flex-col gap-3 2xl:flex-row 2xl:items-center">
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              onSearch={runSearch}
              placeholder="Tìm theo tên hoặc mã sinh viên"
              className="min-w-0 flex-1 sm:min-w-[280px]"
            />
            <div className="hidden 2xl:block h-6 w-px bg-border/70 shrink-0" />
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <FilterPanel
              inline
              bare
              className="shrink-0"
              title="Bộ lọc sinh viên"
              description="Lọc phiên làm bài theo trạng thái và mức độ rủi ro."
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
                setPage(1);
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

        <div className="mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Phiên làm bài</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[26%]">Sinh viên</TableHead>
                    <TableHead className="w-[6%] text-center">Lượt</TableHead>
                    <TableHead className="w-[18%]">Tiến độ</TableHead>
                    <TableHead className="w-[10%] text-center">Đổi tab</TableHead>
                    <TableHead className="w-[12%] text-center">Bằng chứng</TableHead>
                    <TableHead className="w-[14%]">Trạng thái</TableHead>
                    <TableHead className="w-[8%] text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedStudents.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="py-10 text-center text-sm text-muted-foreground"
                      >
                        Không tìm thấy phiên làm bài nào phù hợp với tìm kiếm hoặc bộ lọc hiện tại.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedStudents.map((s) => (
                      <TableRow
                        key={s.id}
                        className={s.status === "flagged" ? "bg-red-50/50" : ""}
                      >
                        <TableCell>
                          <div>
                            <p className="text-sm font-medium">{s.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {s.studentId}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          <div className="flex items-center justify-center gap-1">
                            <span>{s.attemptNo ?? "-"}</span>
                            {s.previousAttempts.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setHistoryDialogStudent(s)}
                                title={`Xem ${s.previousAttempts.length} lượt trước`}
                                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <History className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="w-28">
                            <div className="mb-0.5 flex justify-between text-xs">
                              <span>{s.progress}%</span>
                              {s.score !== null && (
                                <span className="font-medium">{s.score}đ</span>
                              )}
                            </div>
                            <Progress value={s.progress} className="h-1.5" />
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`text-sm font-medium ${s.tabSwitches > 2 ? "text-red-600" : "text-muted-foreground"}`}
                          >
                            {s.tabSwitches}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {s.evidenceCount > 0 ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs hover:bg-muted/50"
                              onClick={() => s.submissionId && openEvidenceDialog(s.submissionId, s.name)}
                            >
                              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{s.evidenceCount}</span>
                              {s.evidenceUnreviewedCount > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-amber-600">
                                  <AlertTriangle className="h-3.5 w-3.5" />
                                  {s.evidenceUnreviewedCount}
                                </span>
                              )}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={s.status} domain="session" className="gap-1">
                            {statusIcon(s.status)}
                            {getStatusBadgeLabel(s.status, "session")}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {s.status === "in_progress" && s.submissionId && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 text-xs"
                                onClick={() =>
                                  flagStudent(
                                    s.submissionId,
                                    "Giảng viên gắn cờ thủ công",
                                  )
                                }
                              >
                                <Flag className="mr-1 h-3.5 w-3.5" /> Gắn cờ
                              </Button>
                            )}
                            {s.submissionId && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-xs">
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    className="gap-2 text-xs"
                                    onClick={() => openEvidenceDialog(s.submissionId as string, s.name)}
                                  >
                                    <Camera className="h-4 w-4" />
                                    Bằng chứng camera
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="gap-2 text-xs"
                                    onClick={() => openRiskDialog(s.submissionId as string, s.name)}
                                  >
                                    <Eye className="h-4 w-4" />
                                    Đánh giá rủi ro
                                    {riskFlagsBySubmission.has(s.submissionId) ? (
                                      <StatusBadge
                                        domain="severity"
                                        status={riskFlagsBySubmission.get(s.submissionId)?.job?.output?.riskLevel || "low"}
                                        className="ml-1"
                                      />
                                    ) : null}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
            <DataPagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={sortedStudents.length}
              onPageChange={setPage}
              itemLabel="sinh viên"
            />
          </Card>
        </div>

        <Dialog open={!!evidenceDialogSubmission} onOpenChange={(open) => !open && closeEvidenceDialog()}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-primary" />
                Bằng chứng camera: {evidenceDialogSubmission?.name}
              </DialogTitle>
              <DialogDescription>
                Ảnh được lưu để hỗ trợ giảng viên rà soát. Nhãn AI chỉ là tín hiệu tham khảo, không kết luận gian lận.
              </DialogDescription>
            </DialogHeader>

            {evidenceLoading ? (
              <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải bằng chứng camera...
              </div>
            ) : evidenceError && evidenceCaptures.length === 0 ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{evidenceError}</div>
            ) : evidenceCaptures.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <ImageOff className="mx-auto h-7 w-7 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">Chưa có ảnh bằng chứng</p>
                <p className="mt-1 text-xs text-muted-foreground">Hệ thống chưa nhận được ảnh camera từ lượt làm bài này.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { key: "all", label: "Tất cả" },
                      { key: "suspicious", label: "Chỉ nghi vấn" },
                      { key: "scheduled", label: "Định kỳ" },
                      { key: "webcam", label: "Webcam" },
                      { key: "screen", label: "Màn hình" },
                      { key: "unreviewed", label: "Chưa rà soát" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setEvidenceFilter(option.key)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${evidenceFilter === option.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

              <div className="grid gap-5 md:grid-cols-[280px_minmax(0,1fr)]">
                <div className="space-y-2 md:max-h-[560px] md:overflow-y-auto md:pr-1">
                  {evidenceGroups.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                      Không có ảnh phù hợp với bộ lọc.
                    </div>
                  ) : (
                    evidenceGroups.map((group) => (
                      <div key={getEvidenceGroupKey(group[0])} className="rounded-lg border p-2">
                        <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                          <span className="text-xs font-medium">{getEvidenceEventLabel(group[0], maxScheduledSlot)}</span>
                          <span className="text-[10px] text-muted-foreground">{formatEvidenceTime(group[0].capturedAt || group[0].scheduledAt || group[0].createdAt)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {group.map((capture) => {
                            const isSelected = selectedEvidenceId === capture.id;
                            const SourceIcon = capture.captureSource === "SCREEN" ? Monitor : Camera;
                            const url = evidenceImageUrls[capture.id];
                            const reviewDotClass = capture.reviewStatus === "REVIEWED" ? "bg-emerald-500" : capture.reviewStatus === "DISMISSED" ? "bg-muted-foreground" : "bg-amber-500";
                            return (
                              <button
                                key={capture.id}
                                type="button"
                                onClick={() => { setSelectedEvidenceId(capture.id); setEvidenceError(null); }}
                                className={`relative aspect-video overflow-hidden rounded-md border ${isSelected ? "ring-2 ring-primary" : "hover:opacity-90"}`}
                              >
                                {url ? (
                                  <img src={url} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center bg-muted/40">
                                    {capture.status === "REQUESTED" || capture.status === "PURGED" ? (
                                      <ImageOff className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                    )}
                                  </div>
                                )}
                                <span className="absolute left-1 top-1 rounded bg-black/60 p-0.5"><SourceIcon className="h-3 w-3 text-white" /></span>
                                <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${reviewDotClass}`} />
                              </button>
                            );
                          })}
                          {group.length === 1 && (
                            <div className="flex aspect-video items-center justify-center rounded-md border border-dashed text-[10px] text-muted-foreground">
                              Chưa có ảnh cặp
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {selectedEvidence && (
                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-lg border bg-muted/20">
                      {evidenceImageLoading && !evidenceImageUrls[selectedEvidence.id] ? (
                        <div className="flex aspect-video items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải ảnh...</div>
                      ) : evidenceImageUrls[selectedEvidence.id] ? (
                        <img src={evidenceImageUrls[selectedEvidence.id]} alt={`Ảnh camera của ${evidenceDialogSubmission?.name}`} className="aspect-video w-full object-contain bg-black" />
                      ) : (
                        <div className="flex aspect-video flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><ImageOff className="h-6 w-6" /> Ảnh không còn khả dụng</div>
                      )}
                    </div>

                    <div className="grid gap-3 text-sm sm:grid-cols-2">
                      <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Thời gian chụp</p><p className="mt-1 font-medium">{formatEvidenceTime(selectedEvidence.capturedAt)}</p></div>
                      <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Nguồn / sự kiện</p><p className="mt-1 flex items-center gap-1.5 font-medium">{selectedEvidence.captureSource === "SCREEN" ? <Monitor className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />} {getEvidenceEventLabel(selectedEvidence, maxScheduledSlot)}</p></div>
                    </div>

                    <div className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-sm font-medium"><Sparkles className="h-4 w-4 text-primary" /> Nhãn phân tích AI</p>
                        {selectedEvidence.status !== "ANALYZING" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 gap-1.5 px-2 text-xs"
                            disabled={reanalyzingEvidenceId === selectedEvidence.id}
                            onClick={() => reanalyzeEvidence(selectedEvidence.id)}
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${reanalyzingEvidenceId === selectedEvidence.id ? "animate-spin" : ""}`} />
                            Phân tích lại
                          </Button>
                        )}
                      </div>
                      {selectedEvidence.status === "ANALYZING" ? <p className="mt-2 text-sm text-muted-foreground">Đang phân tích ảnh...</p> : selectedEvidence.aiError ? <p className="mt-2 text-sm text-red-600">{selectedEvidence.aiError}</p> : Array.isArray(selectedEvidence.aiTags) && selectedEvidence.aiTags.length > 0 ? <div className="mt-2 space-y-2">{selectedEvidence.aiTags.map((tag, index) => <div key={`${tag.tag}-${index}`} className="rounded-md bg-muted/50 p-2 text-sm"><span className="font-medium">{tag.tag || "Tín hiệu"}</span>{typeof tag.confidence === "number" && <span className="ml-2 text-xs text-muted-foreground">{Math.round(tag.confidence * 100)}%</span>}{tag.note && <p className="mt-1 text-xs text-muted-foreground">{tag.note}</p>}</div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">Chưa có nhãn AI cho ảnh này.</p>}
                    </div>

                    <div className="rounded-lg border p-3">
                      <p className="text-sm font-medium">Trạng thái rà soát</p>
                      <p className="mt-1 text-xs text-muted-foreground">{selectedEvidence.reviewStatus === "REVIEWED" ? `Đã rà soát ${formatEvidenceTime(selectedEvidence.reviewedAt)}` : selectedEvidence.reviewStatus === "DISMISSED" ? "Đã bỏ qua" : "Chưa được rà soát"}</p>
                      <Textarea value={evidenceReviewNote} onChange={(event) => setEvidenceReviewNote(event.target.value)} placeholder="Ghi chú rà soát (không bắt buộc)..." className="mt-3 min-h-[72px] text-sm" />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" disabled={evidenceReviewLoading} onClick={() => reviewEvidence("REVIEWED")}>Đánh dấu đã rà soát</Button>
                        <Button size="sm" variant="outline" disabled={evidenceReviewLoading} onClick={() => reviewEvidence("DISMISSED")}>Bỏ qua</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={showScoreDialog} onOpenChange={setShowScoreDialog}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Phân bố điểm
              </DialogTitle>
              <DialogDescription>
                Phân bố điểm của sinh viên đã nộp trong bài thi {id}. Số lượng đã nộp: {stats.submitted}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="h-[360px] w-full">
                  <Bar
                    data={chartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        y: {
                          beginAtZero: true,
                          ticks: { stepSize: 1 },
                          title: { display: true, text: "Sinh viên" },
                        },
                        x: {
                          title: { display: true, text: "Khoảng điểm" },
                        },
                      },
                    }}
                  />
                </div>
              </div>

              {stats.submitted > 0 ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border/70 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Trung bình
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">
                      {(
                        submittedScores.reduce((a, b) => a + b, 0) /
                          submittedScores.length
                      ).toFixed(2)}/10
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Cao nhất
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-green-600">
                      {Math.max(...submittedScores).toFixed(2)}/10
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Thấp nhất
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-red-600">
                      {Math.min(...submittedScores).toFixed(2)}/10
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Phân bố điểm sẽ hiển thị khi sinh viên bắt đầu nộp bài.
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!similarDetail} onOpenChange={(open) => !open && setSimilarDetail(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" /> Chi tiết mẫu trả lời giống nhau
              </DialogTitle>
              <DialogDescription>
                {similarDetail
                  ? `${similarDetail.studentA.studentName} ↔ ${similarDetail.studentB.studentName} — tương đồng ${similarDetail.similarityScore.toFixed(1)}% (${similarDetail.comparableQuestions} câu so sánh). Chỉ cần trùng pattern là thể hiện, không phân biệt đúng/sai.`
                  : ""}
              </DialogDescription>
            </DialogHeader>
            {similarDetail ? (
              <div className="space-y-5">
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-emerald-700">
                      Chọn đúng giống nhau ({similarDetail.matchedBreakdown.correctMatches.length})
                    </h3>
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                      {similarDetail.matchedBreakdown.correctMatches.length} câu
                    </Badge>
                  </div>
                  {similarDetail.matchedBreakdown.correctMatches.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Không có câu nào cùng chọn đúng.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {similarDetail.matchedBreakdown.correctMatches.map((m) => (
                        <div key={m.questionIdentity} className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm">
                          <span className="font-medium">Câu {m.orderIndex != null ? m.orderIndex + 1 : "?"}:</span> đáp án{" "}
                          <span className="font-semibold text-emerald-800">{m.letter}</span>{" "}
                          <span className="text-emerald-700">(đúng)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-red-700">
                      Chọn sai giống nhau ({similarDetail.matchedBreakdown.wrongMatches.length})
                    </h3>
                    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                      {similarDetail.matchedBreakdown.wrongMatches.length} câu
                    </Badge>
                  </div>
                  {similarDetail.matchedBreakdown.wrongMatches.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Không có câu nào cùng chọn sai.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {similarDetail.matchedBreakdown.wrongMatches.map((m) => (
                        <div key={m.questionIdentity} className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm">
                          <span className="font-medium">Câu {m.orderIndex != null ? m.orderIndex + 1 : "?"}:</span> đáp án{" "}
                          <span className="font-semibold text-red-800">{m.letter}</span>{" "}
                          <span className="text-red-700">(sai)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={!!riskDialogSubmission} onOpenChange={(open) => !open && closeRiskDialog()}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Đánh giá dấu hiệu rủi ro — {riskDialogSubmission?.name}
              </DialogTitle>
              <DialogDescription>
                Công cụ này tổng hợp dữ liệu giám sát của lượt làm bài để hỗ trợ giảng viên rà soát.
                Đây chỉ là chỉ báo rủi ro, không phải kết luận sinh viên gian lận.
              </DialogDescription>
            </DialogHeader>

            {!riskResult && !riskLoading && (
              <div className="space-y-4">
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Dữ liệu được xem xét</p>
                  <p className="mt-1 leading-6">
                    Đổi tab, mất focus, thoát fullscreen, thao tác chuột và thời gian trả lời quá nhanh.
                    Hệ thống chỉ dùng các tín hiệu đã ghi nhận trong lượt làm bài này.
                  </p>
                </div>
                {riskEligibilityLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Đang kiểm tra dữ liệu giám sát...
                  </div>
                ) : riskEligibility?.eligible ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Chưa có kết quả đánh giá cho lượt làm bài này.
                    </p>
                    <Button onClick={handleGenerateRisk} className="gap-2" disabled={!riskDialogSubmission}>
                      Phân tích dấu hiệu rủi ro
                    </Button>
                  </>
                ) : riskEligibility ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    {riskEligibility.reason || "Chưa đủ dữ liệu để đánh giá dấu hiệu rủi ro."}
                  </div>
                ) : null}
                {riskError && <p className="text-sm text-red-600">{riskError}</p>}
              </div>
            )}

            {riskLoading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Đang phân tích dữ liệu giám sát...
              </div>
            )}

            {riskResult && !riskLoading && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <StatusBadge domain="severity" status={riskResult.riskLevel?.toLowerCase()}>
                    Rủi ro {getStatusBadgeLabel(riskResult.riskLevel?.toLowerCase(), "severity")}
                  </StatusBadge>
                  <span className="text-sm text-muted-foreground">Điểm rủi ro: {riskResult.riskScore}/100</span>
                  {riskFlag?.status && (
                    <StatusBadge
                      domain="integrity"
                      status={riskFlag.status === "OPEN" ? "pending" : riskFlag.status.toLowerCase()}
                    />
                  )}
                </div>

                <p className="text-sm">{riskResult.explanation}</p>

                {Array.isArray(riskResult.signals) && riskResult.signals.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Tín hiệu được ghi nhận
                    </p>
                    {riskResult.signals.map((sig: any, idx: number) => (
                      <div key={idx} className="rounded-md border border-border bg-muted/30 p-2 text-sm">
                        <span className="font-medium">{sig.type}:</span> {sig.description}
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Xử lý của giảng viên
                  </p>
                  <Textarea
                    placeholder="Ghi chú rà soát (không bắt buộc)..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    className="text-sm min-h-[60px]"
                  />
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!riskFlag?.id}
                      onClick={() => handleReviewFlag("REVIEWED")}
                    >
                      Đã rà soát
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!riskFlag?.id}
                      onClick={() => handleReviewFlag("DISMISSED")}
                    >
                      Bỏ qua cảnh báo
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!riskFlag?.id}
                      onClick={() => handleReviewFlag("CONFIRMED")}
                    >
                      Cần điều tra thêm
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!historyDialogStudent} onOpenChange={(open) => !open && setHistoryDialogStudent(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                Lịch sử các lượt thi: {historyDialogStudent?.name}
              </DialogTitle>
              <DialogDescription>
                Bảng chính chỉ hiển thị lượt mới nhất — đây là các lượt trước đó của sinh viên này.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              {historyDialogStudent?.previousAttempts.map((attempt) => (
                <div key={attempt.submissionId} className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {attempt.attemptNo ?? "-"}
                      </span>
                      <div>
                        <div className="flex items-baseline gap-2">
                          <p className="text-sm font-medium">Lượt {attempt.attemptNo ?? "-"}</p>
                          {attempt.score !== null && <span className="text-sm font-semibold text-foreground">{attempt.score}đ</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">{attempt.submittedAt || "Chưa nộp"}</p>
                      </div>
                    </div>
                    <StatusBadge status={attempt.status} domain="session">
                      {getStatusBadgeLabel(attempt.status, "session")}
                    </StatusBadge>
                  </div>

                  <div className="mt-3 grid grid-cols-3 divide-x rounded-md border bg-muted/30 text-center">
                    <div className="px-2 py-2">
                      <div className="flex items-center justify-center gap-1 text-muted-foreground"><MousePointerClick className="h-3.5 w-3.5" /><span className="text-xs">Đổi tab</span></div>
                      <p className="mt-0.5 text-sm font-semibold">{attempt.tabSwitches}</p>
                    </div>
                    <div className="px-2 py-2">
                      <div className="flex items-center justify-center gap-1 text-muted-foreground"><Activity className="h-3.5 w-3.5" /><span className="text-xs">Sự kiện</span></div>
                      <p className="mt-0.5 text-sm font-semibold">{attempt.integrityEvents}</p>
                    </div>
                    <div className="px-2 py-2">
                      <div className="flex items-center justify-center gap-1 text-muted-foreground"><Camera className="h-3.5 w-3.5" /><span className="text-xs">Bằng chứng</span></div>
                      <p className="mt-0.5 text-sm font-semibold">
                        {attempt.evidenceCount}
                        {attempt.evidenceUnreviewedCount > 0 && (
                          <span className="ml-1 text-xs font-normal text-amber-600">({attempt.evidenceUnreviewedCount} chưa rà soát)</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 h-8 w-full gap-1.5"
                    disabled={attempt.evidenceCount === 0}
                    onClick={() => {
                      // Deliberately don't close the history dialog here — it
                      // stays open underneath so closing the evidence dialog
                      // returns the lecturer to the attempt list instead of
                      // dropping them all the way back to the submissions table.
                      void openEvidenceDialog(attempt.submissionId, `${historyDialogStudent?.name} — Lượt ${attempt.attemptNo ?? "-"}`);
                    }}
                  >
                    <Camera className="h-3.5 w-3.5" />
                    {attempt.evidenceCount > 0 ? "Xem bằng chứng" : "Không có bằng chứng"}
                  </Button>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}


