"use client";

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  AlertTriangle,
  Clock,
  Users,
  FileText,
  Activity,
  CheckCircle2,
  XCircle,
  ExternalLink,
  MessageSquare,
  Camera,
  Monitor,
  ImageOff,
  Loader2,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import type { FlaggedSubmission, IntegrityReason } from '@/features/admin/IntegrityOverview';
import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import { INTEGRITY_EVENT_LABELS, getIntegrityEventLabel, formatSignalDescription } from '@/lib/integrity-event-labels';
import { toast } from 'sonner';

interface IntegrityCaseDetailProps {
  submission: FlaggedSubmission;
  onBack: () => void;
  onReview: (status: 'REVIEWED' | 'DISMISSED' | 'CONFIRMED', notes: string, deductionPercent?: 10 | 25 | 50 | 100, applyPenalty?: boolean, penaltyMode?: 'PERCENT' | 'FIXED', penaltyAmount?: number) => Promise<void>;
  isSaving?: boolean;
}

type IntegrityTimelineEvent = {
  id: string;
  timestamp: string;
  type: string;
  description: string;
  severity: 'normal' | 'warning' | 'critical';
  detail?: string;
};

type EvidenceCapture = {
  id: string;
  status?: string;
  trigger?: 'SCHEDULED' | 'SUSPICIOUS_EVENT';
  captureSource?: 'WEBCAM' | 'SCREEN';
  triggerDetails?: unknown;
  scheduledSlot?: number | null;
  scheduledAt?: string | null;
  capturedAt?: string | null;
  createdAt?: string | null;
  aiTags?: Array<{ tag?: string; confidence?: number; note?: string }> | null;
  aiError?: string | null;
  reviewStatus?: 'PENDING' | 'REVIEWED' | 'DISMISSED' | null;
  reviewerNote?: string | null;
  reviewedAt?: string | null;
};

// Labels a SCHEDULED capture by its position in the schedule — slot 0 is
// always the exam-start checkpoint, the highest slot seen is always the
// guaranteed end-of-exam checkpoint, and anything in between is numbered by
// its own slot index (1, 2, 3...).
function getEvidenceEventLabel(capture: EvidenceCapture, maxScheduledSlot?: number | null): string {
  if (capture.trigger === 'SCHEDULED') {
    const slot = capture.scheduledSlot;
    if (slot === 0) return 'Ảnh bắt đầu';
    if (slot != null && maxScheduledSlot != null && slot === maxScheduledSlot) return 'Ảnh kết thúc';
    return slot != null ? `Định kỳ ${slot}` : 'Định kỳ';
  }
  const details = capture.triggerDetails as { signals?: string[] } | null | undefined;
  const signal = details?.signals?.find((s) => INTEGRITY_EVENT_LABELS[s.toLowerCase()]);
  return signal ? getIntegrityEventLabel(signal) : 'Sự kiện nghi vấn';
}

// Webcam + screen shots for one trigger are created back-to-back — bucketing
// by scheduledSlot (for SCHEDULED) or a small time window (for
// SUSPICIOUS_EVENT) pairs them without needing a dedicated group-id column.
function getEvidenceGroupKey(capture: EvidenceCapture): string {
  if (capture.scheduledSlot != null) return `scheduled-${capture.scheduledSlot}`;
  const bucket = Math.floor(new Date(capture.createdAt || 0).getTime() / 5000);
  return `event-${capture.trigger}-${bucket}`;
}

export function IntegrityCaseDetail({ submission, onBack, onReview, isSaving = false }: IntegrityCaseDetailProps) {
  const [reviewNotes, setReviewNotes] = useState(submission.integrityReview?.reviewerNote || '');
  const [integrityEvents, setIntegrityEvents] = useState<IntegrityTimelineEvent[]>([]);
  const [evidenceCaptures, setEvidenceCaptures] = useState<EvidenceCapture[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [evidenceImageUrls, setEvidenceImageUrls] = useState<Record<string, string>>({});
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [evidenceImageLoading, setEvidenceImageLoading] = useState(false);
  const [evidenceReviewNote, setEvidenceReviewNote] = useState('');
  const [evidenceReviewLoading, setEvidenceReviewLoading] = useState(false);
  const [reanalyzingEvidenceId, setReanalyzingEvidenceId] = useState<string | null>(null);
  const [evidenceFilter, setEvidenceFilter] = useState<'all' | 'suspicious' | 'scheduled' | 'webcam' | 'screen' | 'unreviewed'>('all');
  const [penaltyDialogOpen, setPenaltyDialogOpen] = useState(false);
  const [dismissConfirmDialogOpen, setDismissConfirmDialogOpen] = useState(false);
  const [deductionPercent, setDeductionPercent] = useState<10 | 25 | 50 | 100>(10);
  const [applyPenalty, setApplyPenalty] = useState(false);
  const [penaltyMode, setPenaltyMode] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [penaltyAmount, setPenaltyAmount] = useState('1');

  useEffect(() => {
    setReviewNotes(submission.integrityReview?.reviewerNote || '');
  }, [submission.id, submission.submissionId, submission.integrityReview?.reviewerNote]);

  const getConfidenceLabel = (confidence: FlaggedSubmission['confidence']) => ({
    High: 'Cao',
    Medium: 'Trung bình',
    Low: 'Thấp',
  }[confidence] ?? confidence);

  const getReasonLabel = (type: IntegrityReason['type']) => ({
    similarity: 'Tương đồng bài làm',
    timing: 'Bất thường thời gian',
    pattern: 'Mẫu bất thường',
    behavior: 'Hành vi làm bài',
  }[type] ?? 'Tín hiệu cần xem xét');

  const getSeverityPresentation = (severity: IntegrityTimelineEvent['severity']) => {
    if (severity === 'critical') {
      return {
        label: 'Nghiêm trọng',
        rowClassName: 'border border-destructive/25 bg-destructive/10',
        badgeClassName: 'bg-destructive/15 text-destructive',
      };
    }

    return {
      label: 'Cảnh báo',
      rowClassName: 'border border-warning/25 bg-warning/10',
      badgeClassName: 'bg-warning/15 text-warning',
    };
  };

  const formatEventTime = (value: string) => new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));

  const getCaptureSignals = (capture: EvidenceCapture) => {
    const raw = capture.triggerDetails;
    const details = typeof raw === 'string'
      ? (() => { try { return JSON.parse(raw); } catch { return null; } })()
      : raw;
    return Array.isArray((details as { signals?: unknown[] } | null)?.signals)
      ? (details as { signals: unknown[] }).signals.map((signal) => String(signal).toLowerCase())
      : [];
  };

  const evidenceForEvent = (event: IntegrityTimelineEvent) => {
    const eventTime = new Date(event.timestamp).getTime();
    const nearest = evidenceCaptures
      .filter((capture) => capture.capturedAt && capture.status !== 'PURGED' && getCaptureSignals(capture).includes(event.type.toLowerCase()))
      .sort((left, right) => {
        const leftTime = new Date(left.capturedAt || left.createdAt || 0).getTime();
        const rightTime = new Date(right.capturedAt || right.createdAt || 0).getTime();
        return Math.abs(leftTime - eventTime) - Math.abs(rightTime - eventTime);
      })[0] || null;
    if (!nearest) return null;
    const captureTime = new Date(nearest.capturedAt || nearest.createdAt || 0).getTime();
    return Math.abs(captureTime - eventTime) <= 60_000 ? nearest : null;
  };

  useEffect(() => {
    let active = true;

    const loadIntegrityEvents = async () => {
      if (!submission.submissionId) {
        setIntegrityEvents([]);
        return;
      }

      setEventsLoading(true);
      setEventsError('');
      try {
        const [timeline, captures] = await Promise.all([
          api.getSubmissionTimeline(submission.submissionId),
          api.getEvidenceCaptures(submission.submissionId),
        ]);
        const events = Array.isArray(timeline?.events) ? timeline.events : [];
        if (active) {
          setIntegrityEvents(events.filter((event: IntegrityTimelineEvent) => event.severity !== 'normal'));
          setEvidenceCaptures(Array.isArray(captures) ? captures : []);
        }
      } catch (error) {
        if (active) {
          setIntegrityEvents([]);
          setEvidenceCaptures([]);
          setEventsError(error instanceof Error ? error.message : 'Không thể tải chi tiết sự kiện.');
        }
      } finally {
        if (active) setEventsLoading(false);
      }
    };

    loadIntegrityEvents();
    return () => {
      active = false;
    };
  }, [submission.submissionId]);

  useEffect(() => () => {
    Object.values(evidenceImageUrls).forEach((url) => URL.revokeObjectURL(url));
    // Only run on unmount — revoking on every render would invalidate URLs
    // that are still displayed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxScheduledSlot = useMemo(() => {
    const slots = evidenceCaptures
      .filter((c) => c.trigger === 'SCHEDULED' && c.scheduledSlot != null)
      .map((c) => c.scheduledSlot as number);
    return slots.length ? Math.max(...slots) : null;
  }, [evidenceCaptures]);

  const filteredEvidenceCaptures = useMemo(() => {
    return evidenceCaptures.filter((capture) => {
      switch (evidenceFilter) {
        case 'suspicious':
          return capture.trigger === 'SUSPICIOUS_EVENT';
        case 'scheduled':
          return capture.trigger === 'SCHEDULED';
        case 'webcam':
          return (capture.captureSource || 'WEBCAM') === 'WEBCAM';
        case 'screen':
          return capture.captureSource === 'SCREEN';
        case 'unreviewed':
          return !capture.reviewStatus || capture.reviewStatus === 'PENDING';
        default:
          return true;
      }
    });
  }, [evidenceCaptures, evidenceFilter]);

  const evidenceGroups = useMemo(() => {
    const map = new Map<string, EvidenceCapture[]>();
    filteredEvidenceCaptures.forEach((capture) => {
      const key = getEvidenceGroupKey(capture);
      map.set(key, [...(map.get(key) || []), capture]);
    });
    return [...map.values()]
      .map((items) => [...items].sort((a, b) => (a.captureSource === 'SCREEN' ? 1 : -1)))
      .sort((a, b) => new Date(a[0].createdAt || 0).getTime() - new Date(b[0].createdAt || 0).getTime());
  }, [filteredEvidenceCaptures]);

  const selectedEvidence = evidenceCaptures.find((capture) => capture.id === selectedEvidenceId) || null;

  // Thumbnails need the actual image up front (not just on click) — capture
  // volume is capped low by policy, so loading them all is cheap enough to
  // skip a lazy/on-scroll loader.
  useEffect(() => {
    if (!submission.submissionId || evidenceCaptures.length === 0) return;
    const pending = evidenceCaptures.filter(
      (capture) => capture.status !== 'REQUESTED' && capture.status !== 'PURGED' && !evidenceImageUrls[capture.id],
    );
    if (pending.length === 0) return;
    let active = true;
    setEvidenceImageLoading(true);
    Promise.all(
      pending.map((capture) =>
        api
          .getEvidenceImageUrl(submission.submissionId as string, capture.id)
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
  }, [submission.submissionId, evidenceCaptures]);

  useEffect(() => {
    if (selectedEvidenceId || evidenceCaptures.length === 0) return;
    setSelectedEvidenceId(evidenceCaptures[0].id);
  }, [evidenceCaptures, selectedEvidenceId]);

  // Single source of truth for the note textarea. Previously this was only
  // set from the thumbnail's own onClick handler, so the auto-selected first
  // capture (above) and the "Xem bằng chứng" jump-to-evidence button (further
  // down) both left it blank — the saved note only appeared after manually
  // re-clicking the same thumbnail, making it look unsaved on first load.
  useEffect(() => {
    setEvidenceReviewNote(selectedEvidence?.reviewerNote || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEvidenceId]);

  const reviewEvidence = async (reviewStatus: 'REVIEWED' | 'DISMISSED') => {
    if (!submission.submissionId || !selectedEvidence) return;
    // A webcam shot and its paired screen shot are two captures for the SAME
    // triggering event (same evidenceGroups bucket the thumbnail list already
    // shows them under) — reviewing just the one currently open left its pair
    // permanently "chưa rà soát", forcing the lecturer to open and re-mark
    // each half of every pair separately. Apply the same status/note to the
    // whole group instead.
    const group = evidenceGroups.find((g) => g.some((capture) => capture.id === selectedEvidence.id)) || [selectedEvidence];
    setEvidenceReviewLoading(true);
    try {
      const reviewerNote = evidenceReviewNote.trim() || undefined;
      const updates = await Promise.all(
        group.map((capture) =>
          api.reviewEvidenceCapture(submission.submissionId as string, capture.id, { reviewStatus, reviewerNote }),
        ),
      );
      setEvidenceCaptures((current) => current.map((capture) => {
        const updated = updates.find((item) => item.id === capture.id);
        return updated ? { ...capture, ...updated } : capture;
      }));
      toast.success(reviewStatus === 'REVIEWED' ? 'Đã đánh dấu bằng chứng (webcam + màn hình) là đã rà soát.' : 'Đã bỏ qua bằng chứng này (webcam + màn hình).');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái rà soát.');
    } finally {
      setEvidenceReviewLoading(false);
    }
  };

  // Analysis runs async on the AI queue worker — there is no push channel for
  // this one capture, so after triggering a retry we short-poll the capture
  // list until this specific capture leaves ANALYZING (or we give up).
  const reanalyzeEvidence = async (captureId: string) => {
    if (!submission.submissionId) return;
    setReanalyzingEvidenceId(captureId);
    try {
      await api.reanalyzeEvidenceCapture(submission.submissionId, captureId);
      setEvidenceCaptures((current) => current.map((capture) => capture.id === captureId ? { ...capture, status: 'ANALYZING', aiError: null } : capture));
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const captures = await api.getEvidenceCaptures(submission.submissionId);
        const updated = Array.isArray(captures) ? captures.find((item: EvidenceCapture) => item.id === captureId) : null;
        if (updated) setEvidenceCaptures((current) => current.map((capture) => capture.id === captureId ? { ...capture, ...updated } : capture));
        if (updated && updated.status !== 'ANALYZING') break;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể phân tích lại ảnh bằng chứng.');
    } finally {
      setReanalyzingEvidenceId(null);
    }
  };

  const formatEvidenceTime = (value?: string | null) => value ? new Date(value).toLocaleString('vi-VN') : 'Chưa có';

  const getReasonIcon = (type: IntegrityReason['type']) => {
    switch (type) {
      case 'similarity':
        return <Users className="h-4 w-4" />;
      case 'timing':
        return <Clock className="h-4 w-4" />;
      case 'pattern':
        return <FileText className="h-4 w-4" />;
      case 'behavior':
        return <Activity className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const getReasonColor = (type: IntegrityReason['type']) => {
    switch (type) {
      case 'similarity':
        return 'text-destructive bg-destructive/10';
      case 'timing':
        return 'text-warning bg-warning/10';
      case 'pattern':
        return 'text-info bg-info/10';
      case 'behavior':
        return 'text-muted-foreground bg-muted';
      default:
        return 'text-muted-foreground bg-muted';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const totalWeight = submission.reasons.reduce((sum, r) => sum + r.weight, 0);
  const academicScore = Number(submission.academicScore ?? submission.integrityReview?.academicScore ?? 0);
  const fixedPenaltyAmount = Number(penaltyAmount);
  const deductedScore = penaltyMode === 'FIXED'
    ? Number(Math.min(academicScore, Number.isFinite(fixedPenaltyAmount) ? fixedPenaltyAmount : 0).toFixed(2))
    : Number((academicScore * deductionPercent / 100).toFixed(2));
  const finalScore = Number(Math.max(0, academicScore - deductedScore).toFixed(2));
  const activePenalty = submission.integrityReview?.status === 'confirmed'
    && (submission.integrityReview.penaltyPercent || submission.integrityReview.penaltyAmount);
  const isDismissed =
    submission.status?.toLowerCase() === 'dismissed' ||
    submission.integrityReview?.status?.toLowerCase() === 'dismissed';

  const confirmPenalty = async () => {
    await onReview(
      'CONFIRMED',
      reviewNotes,
      applyPenalty && penaltyMode === 'PERCENT' ? deductionPercent : undefined,
      applyPenalty,
      applyPenalty ? penaltyMode : undefined,
      applyPenalty && penaltyMode === 'FIXED' ? fixedPenaltyAmount : undefined,
    );
    setPenaltyDialogOpen(false);
  };

  const openConfirmation = () => {
    const hasActivePenalty = Boolean(activePenalty);
    setApplyPenalty(hasActivePenalty);
    if (hasActivePenalty) {
      const existingMode = submission.integrityReview?.penaltyMode === 'FIXED' ? 'FIXED' : 'PERCENT';
      setPenaltyMode(existingMode);
      if (existingMode === 'FIXED') setPenaltyAmount(String(submission.integrityReview?.penaltyAmount ?? 1));
      if (existingMode === 'PERCENT' && submission.integrityReview?.penaltyPercent) {
        setDeductionPercent(submission.integrityReview.penaltyPercent as 10 | 25 | 50 | 100);
      }
    }
    setPenaltyDialogOpen(true);
  };

  const handleDismissClick = () => {
    const hasActiveReview = Boolean(
      activePenalty ||
      submission.status?.toLowerCase() === 'confirmed' ||
      submission.integrityReview?.status?.toLowerCase() === 'confirmed'
    );
    if (hasActiveReview) {
      setDismissConfirmDialogOpen(true);
    } else {
      onReview('DISMISSED', reviewNotes);
    }
  };

  const confirmDismiss = async () => {
    setDismissConfirmDialogOpen(false);
    await onReview('DISMISSED', reviewNotes);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-foreground">
                  Rà soát toàn vẹn
                </h1>
                <StatusBadge
                  status={submission.confidence}
                  domain="confidence"
                >
                  Mức tín hiệu {getConfidenceLabel(submission.confidence)}
                </StatusBadge>
              </div>
              <p className="text-muted-foreground mt-1">
                Mã vụ việc: {submission.submissionId || submission.id}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline">
              <ExternalLink className="h-4 w-4 mr-2" />
              Xem bài nộp
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Student & Exam Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Thông tin bài nộp</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Sinh viên</p>
                      <p className="font-medium">{submission.studentName}</p>
                      <p className="text-sm text-muted-foreground">{submission.studentId}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Bài thi</p>
                      <p className="font-medium">{submission.examTitle}</p>
                      <p className="text-sm text-muted-foreground">{submission.examId}</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Thời điểm nộp</p>
                      <p className="font-medium">{formatDate(submission.submittedAt)}</p>
                    </div>
                    {submission.similarityScore !== undefined && (
                      <div>
                        <p className="text-sm text-muted-foreground">Điểm tương đồng</p>
                        <div className="flex items-center gap-3 mt-1">
                          <Progress value={submission.similarityScore} className="h-2 flex-1" />
                          <span className="text-sm font-semibold text-destructive">
                            {submission.similarityScore}%
                          </span>
                        </div>
                      </div>
                    )}
                    {submission.patternMatch && submission.patternMatch.length > 0 && (
                      <div>
                        <p className="text-sm text-muted-foreground">Tương đồng với</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {submission.patternMatch.map((match) => (
                            <StatusBadge key={match} variant="default">
                              {match}
                            </StatusBadge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {activePenalty ? (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-destructive">Khấu trừ điểm do gian lận</CardTitle>
                  <CardDescription>Quyết định đang có hiệu lực cho bài nộp này.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
                  <div><p className="text-muted-foreground">Điểm học thuật</p><p className="font-semibold">{Number(submission.integrityReview?.academicScore ?? academicScore).toFixed(2)} / 10</p></div>
                  <div><p className="text-muted-foreground">Khấu trừ</p><p className="font-semibold text-destructive">{submission.integrityReview?.penaltyMode === 'FIXED' ? `-${Number(submission.integrityReview?.penaltyAmount ?? submission.integrityReview?.deductedScore ?? 0).toFixed(2)} điểm` : `${submission.integrityReview?.penaltyPercent}% (-${Number(submission.integrityReview?.deductedScore ?? 0).toFixed(2)})`}</p></div>
                  <div><p className="text-muted-foreground">Điểm cuối</p><p className="font-semibold">{Number(submission.integrityReview?.finalScore ?? 0).toFixed(2)} / 10</p></div>
                  {submission.integrityReview?.reviewerNote ? <p className="sm:col-span-3 text-muted-foreground">Lý do: {submission.integrityReview.reviewerNote}</p> : null}
                  {submission.integrityReview?.auditLogs?.length ? <div className="sm:col-span-3 border-t border-destructive/15 pt-3"><p className="mb-2 font-medium">Lịch sử quyết định</p><div className="space-y-1 text-xs text-muted-foreground">{submission.integrityReview.auditLogs.map((audit, index) => <p key={`${audit.createdAt}-${index}`}>{new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(audit.createdAt))}: {audit.action === 'PENALTY_APPLIED' ? 'Áp dụng khấu trừ' : audit.action === 'PENALTY_UPDATED' ? 'Điều chỉnh khấu trừ' : audit.action === 'PENALTY_FIXED_APPLIED' ? 'Áp dụng trừ thẳng điểm' : audit.action === 'PENALTY_FIXED_UPDATED' ? 'Điều chỉnh trừ thẳng điểm' : audit.action === 'PENALTY_REVOKED' ? 'Hủy khấu trừ' : 'Cập nhật rà soát'}{audit.nextPercent ? ` ${audit.nextPercent}%` : audit.action.startsWith('PENALTY_FIXED') && audit.deductedScore != null ? ` ${Number(audit.deductedScore).toFixed(2)} điểm` : ''}{audit.note ? ` — ${audit.note}` : ''}</p>)}</div></div> : null}
                </CardContent>
              </Card>
            ) : null}

            {/* Detection Reasons */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Phân tích phát hiện</CardTitle>
                <CardDescription>
                  Giải thích do AI tạo cho các tín hiệu cần rà soát của bài nộp này
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {submission.reasons.map((reason, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-border p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded flex items-center justify-center ${getReasonColor(reason.type)}`}>
                          {getReasonIcon(reason.type)}
                        </div>
                        <div>
                          <p className="font-medium text-foreground capitalize">
                            {getReasonLabel(reason.type)}
                          </p>
                          <p className="text-sm text-foreground">
                            {formatSignalDescription(reason.description)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Trọng số</p>
                        <p className="font-semibold">
                          {Math.round((reason.weight / totalWeight) * 100)}%
                        </p>
                      </div>
                    </div>
                    {reason.evidence && (
                      <>
                        <Separator />
                        <div className="bg-muted/50 rounded-md p-3">
                          <p className="text-xs text-muted-foreground uppercase font-medium mb-1">
                            Bằng chứng
                          </p>
                          <p className="text-sm text-foreground">{reason.evidence}</p>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">Chi tiết sự kiện nghi vấn</p>
                      <p className="text-sm text-muted-foreground">
                        Hiển thị từng sự kiện đã được ghi nhận, phục vụ việc rà soát của giảng viên.
                      </p>
                    </div>
                    {!eventsLoading ? <span className="text-sm font-medium text-muted-foreground">{integrityEvents.length} sự kiện</span> : null}
                  </div>

                  {eventsLoading ? (
                    <p className="mt-4 text-sm text-muted-foreground">Đang tải chi tiết sự kiện...</p>
                  ) : eventsError ? (
                    <p className="mt-4 text-sm text-destructive">{eventsError}</p>
                  ) : integrityEvents.length ? (
                    <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
                      {integrityEvents.map((event) => {
                        const severity = getSeverityPresentation(event.severity);
                        const evidence = evidenceForEvent(event);
                        return (
                        <div key={event.id} className={`rounded-md px-3 py-2 ${severity.rowClassName}`}>
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-medium text-foreground">{event.description}</p>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${severity.badgeClassName}`}>{severity.label}</span>
                              <time className="text-xs text-muted-foreground">{formatEventTime(event.timestamp)}</time>
                            </div>
                          </div>
                          {event.detail ? <p className="mt-1 text-xs text-muted-foreground">{event.detail}</p> : null}
                          {evidence ? (
                            <Button
                              className="mt-2 h-7 gap-1.5"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedEvidenceId(evidence.id);
                                document.getElementById('evidence-gallery')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }}
                            >
                              <Camera className="h-3.5 w-3.5" />
                              Xem bằng chứng
                            </Button>
                          ) : null}
                        </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">Không có sự kiện nghi vấn chi tiết để hiển thị.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card id="evidence-gallery">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Camera className="h-4 w-4 text-primary" />
                  Bằng chứng camera / màn hình
                </CardTitle>
                <CardDescription>
                  Ảnh webcam và ảnh chụp màn hình được lưu để hỗ trợ rà soát. Nhãn AI chỉ là tín hiệu tham khảo, không kết luận gian lận. Chỉ các tín hiệu đã được ghi nhận ở trên mới được dùng để hỗ trợ quyết định.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {eventsLoading ? (
                  <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Đang tải bằng chứng...
                  </div>
                ) : evidenceCaptures.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <ImageOff className="mx-auto h-7 w-7 text-muted-foreground" />
                    <p className="mt-2 text-sm font-medium">Chưa có ảnh bằng chứng</p>
                    <p className="mt-1 text-xs text-muted-foreground">Hệ thống chưa nhận được ảnh camera/màn hình từ lượt làm bài này.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { key: 'all', label: 'Tất cả' },
                          { key: 'suspicious', label: 'Chỉ nghi vấn' },
                          { key: 'scheduled', label: 'Định kỳ' },
                          { key: 'webcam', label: 'Webcam' },
                          { key: 'screen', label: 'Màn hình' },
                          { key: 'unreviewed', label: 'Chưa rà soát' },
                        ] as const
                      ).map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setEvidenceFilter(option.key)}
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${evidenceFilter === option.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/50'}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    <div className="grid gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
                      <div className="space-y-2 md:max-h-[520px] md:overflow-y-auto md:pr-1">
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
                                  const SourceIcon = capture.captureSource === 'SCREEN' ? Monitor : Camera;
                                  const url = evidenceImageUrls[capture.id];
                                  const reviewDotClass = capture.reviewStatus === 'REVIEWED' ? 'bg-emerald-500' : capture.reviewStatus === 'DISMISSED' ? 'bg-muted-foreground' : 'bg-amber-500';
                                  return (
                                    <button
                                      key={capture.id}
                                      type="button"
                                      onClick={() => setSelectedEvidenceId(capture.id)}
                                      className={`relative aspect-video overflow-hidden rounded-md border ${isSelected ? 'ring-2 ring-primary' : 'hover:opacity-90'}`}
                                    >
                                      {url ? (
                                        <img src={url} alt="" className="h-full w-full object-cover" />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center bg-muted/40">
                                          {capture.status === 'REQUESTED' || capture.status === 'PURGED' ? (
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
                              <img src={evidenceImageUrls[selectedEvidence.id]} alt="Bằng chứng camera/màn hình" className="aspect-video w-full object-contain bg-black" />
                            ) : (
                              <div className="flex aspect-video flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><ImageOff className="h-6 w-6" /> Ảnh không còn khả dụng</div>
                            )}
                          </div>

                          <div className="grid gap-3 text-sm sm:grid-cols-2">
                            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Thời gian chụp</p><p className="mt-1 font-medium">{formatEvidenceTime(selectedEvidence.capturedAt)}</p></div>
                            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Nguồn / sự kiện</p><p className="mt-1 flex items-center gap-1.5 font-medium">{selectedEvidence.captureSource === 'SCREEN' ? <Monitor className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />} {getEvidenceEventLabel(selectedEvidence, maxScheduledSlot)}</p></div>
                          </div>

                          <div className="rounded-lg border p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="flex items-center gap-1.5 text-sm font-medium"><Sparkles className="h-4 w-4 text-primary" /> Nhãn phân tích AI</p>
                              {selectedEvidence.status !== 'ANALYZING' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 gap-1.5 px-2 text-xs"
                                  disabled={reanalyzingEvidenceId === selectedEvidence.id}
                                  onClick={() => reanalyzeEvidence(selectedEvidence.id)}
                                >
                                  <RefreshCw className={`h-3.5 w-3.5 ${reanalyzingEvidenceId === selectedEvidence.id ? 'animate-spin' : ''}`} />
                                  Phân tích lại
                                </Button>
                              )}
                            </div>
                            {selectedEvidence.status === 'ANALYZING' ? <p className="mt-2 text-sm text-muted-foreground">Đang phân tích ảnh...</p> : selectedEvidence.aiError ? <p className="mt-2 text-sm text-red-600">{selectedEvidence.aiError}</p> : Array.isArray(selectedEvidence.aiTags) && selectedEvidence.aiTags.length > 0 ? <div className="mt-2 space-y-2">{selectedEvidence.aiTags.map((tag, index) => <div key={`${tag.tag}-${index}`} className="rounded-md bg-muted/50 p-2 text-sm"><span className="font-medium">{tag.tag || 'Tín hiệu'}</span>{typeof tag.confidence === 'number' && <span className="ml-2 text-xs text-muted-foreground">{Math.round(tag.confidence * 100)}%</span>}{tag.note && <p className="mt-1 text-xs text-muted-foreground">{tag.note}</p>}</div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">Chưa có nhãn AI cho ảnh này.</p>}
                          </div>

                          <div className="rounded-lg border p-3">
                            <p className="text-sm font-medium">Trạng thái rà soát</p>
                            <p className="mt-1 text-xs text-muted-foreground">{selectedEvidence.reviewStatus === 'REVIEWED' ? `Đã rà soát ${formatEvidenceTime(selectedEvidence.reviewedAt)}` : selectedEvidence.reviewStatus === 'DISMISSED' ? 'Đã bỏ qua' : 'Chưa được rà soát'}</p>
                            <Textarea value={evidenceReviewNote} onChange={(event) => setEvidenceReviewNote(event.target.value)} placeholder="Ghi chú rà soát (không bắt buộc)..." className="mt-3 min-h-[72px] text-sm" />
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button size="sm" variant="outline" disabled={evidenceReviewLoading} onClick={() => reviewEvidence('REVIEWED')}>Đánh dấu đã rà soát</Button>
                              <Button size="sm" variant="outline" disabled={evidenceReviewLoading} onClick={() => reviewEvidence('DISMISSED')}>Bỏ qua</Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Đánh giá rủi ro</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center py-4">
                  <div className={`inline-flex items-center justify-center h-20 w-20 rounded-full ${
                    submission.confidence === 'High' 
                      ? 'bg-destructive/10 text-destructive' 
                      : submission.confidence === 'Medium'
                      ? 'bg-warning/10 text-warning'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    <AlertTriangle className="h-10 w-10" />
                  </div>
                  <p className="mt-3 text-lg font-semibold">Mức tín hiệu {getConfidenceLabel(submission.confidence)}</p>
                  <p className="text-sm text-foreground">
                    {submission.reasons.length} tín hiệu ghi nhận
                  </p>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Điểm tương đồng</span>
                    <span className="font-medium">{submission.similarityScore ?? 'Chưa có dữ liệu'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tín hiệu thời gian</span>
                    <span className="font-medium">{submission.timeAnomaly ? 'Có tín hiệu' : 'Không ghi nhận'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Mẫu hành vi</span>
                    <span className="font-medium">{submission.patternMatch?.length ? submission.patternMatch.length : 'Chưa có dữ liệu'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Review Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quyết định rà soát</CardTitle>
                <CardDescription>Ghi nhận đánh giá của bạn</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Ghi chú rà soát
                  </label>
                  <Textarea
                    placeholder="Thêm ghi chú về kết quả rà soát..."
                    className="mt-2"
                    rows={4}
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Button className="w-full" variant="destructive" disabled={isSaving} onClick={openConfirmation}>
                    <XCircle className="h-4 w-4 mr-2" />
                    {activePenalty ? 'Điều chỉnh mức khấu trừ' : 'Xác nhận cần xử lý'}
                  </Button>
                  <Button className="w-full" variant="outline" disabled={isSaving || isDismissed} onClick={handleDismissClick}>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Loại trừ tín hiệu
                  </Button>
                  <Button className="w-full" variant="ghost" disabled={isSaving || isDismissed} onClick={() => onReview('REVIEWED', reviewNotes)}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Đánh dấu đã xem xét
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Student History */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Lịch sử sinh viên</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Lịch sử tổng hợp chưa được cung cấp bởi API và không được suy diễn từ tín hiệu hiện tại.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <Dialog open={penaltyDialogOpen} onOpenChange={setPenaltyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận cần xử lý vụ việc</DialogTitle>
            <DialogDescription>Xác nhận này ghi nhận kết quả rà soát. Hiệu chỉnh điểm chỉ áp dụng khi bạn chủ động chọn bên dưới.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
              <Checkbox checked={applyPenalty} onCheckedChange={(checked) => setApplyPenalty(Boolean(checked))} className="mt-0.5" />
              <span className="space-y-1 text-sm">
                <span className="block font-medium">Hiệu chỉnh điểm của sinh viên</span>
                <span className="block text-muted-foreground">Chọn tùy chọn này để áp dụng mức khấu trừ cho bài nộp. Nếu không chọn, điểm giữ nguyên.</span>
              </span>
            </label>
            {applyPenalty ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={penaltyMode === 'PERCENT' ? 'destructive' : 'outline'} onClick={() => setPenaltyMode('PERCENT')}>Theo phần trăm</Button>
                  <Button type="button" variant={penaltyMode === 'FIXED' ? 'destructive' : 'outline'} onClick={() => setPenaltyMode('FIXED')}>Trừ thẳng điểm</Button>
                </div>
                {penaltyMode === 'PERCENT' ? <div className="grid grid-cols-4 gap-2">{([10, 25, 50, 100] as const).map((percent) => (<Button key={percent} type="button" variant={deductionPercent === percent ? 'destructive' : 'outline'} onClick={() => setDeductionPercent(percent)}>{percent}%</Button>))}</div> : <div className="space-y-2"><label className="text-sm font-medium">Số điểm trừ (thang 10)</label><Input type="number" min="0.01" max="10" step="0.01" value={penaltyAmount} onChange={(event) => setPenaltyAmount(event.target.value)} /><p className="text-xs text-muted-foreground">Điểm cuối không thấp hơn 0.</p></div>}
                <div className="grid grid-cols-3 gap-3 rounded-lg bg-muted/50 p-3 text-sm">
                  <div><p className="text-muted-foreground">Điểm học thuật</p><p className="font-semibold">{academicScore.toFixed(2)} / 10</p></div>
                  <div><p className="text-muted-foreground">Bị trừ</p><p className="font-semibold text-destructive">-{deductedScore.toFixed(2)}</p></div>
                  <div><p className="text-muted-foreground">Điểm cuối</p><p className="font-semibold">{finalScore.toFixed(2)} / 10</p></div>
                </div>
              </>
            ) : activePenalty ? <p className="text-xs text-muted-foreground">Mức khấu trừ hiện có sẽ được giữ nguyên. Dùng thao tác loại trừ tín hiệu để hủy một quyết định khấu trừ đang có hiệu lực.</p> : null}
            {!reviewNotes.trim() ? <p className="text-sm text-destructive">Cần nhập lý do rà soát trước khi xác nhận.</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={isSaving} onClick={() => setPenaltyDialogOpen(false)}>Hủy</Button>
            <Button variant="destructive" disabled={isSaving || !reviewNotes.trim() || (applyPenalty && penaltyMode === 'FIXED' && (!Number.isFinite(fixedPenaltyAmount) || fixedPenaltyAmount <= 0 || fixedPenaltyAmount > 10))} onClick={confirmPenalty}>{applyPenalty ? 'Xác nhận và áp dụng' : 'Xác nhận cần xử lý'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={dismissConfirmDialogOpen} onOpenChange={setDismissConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Xác nhận loại trừ tín hiệu
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm text-foreground">
                <p>
                  Bài nộp này hiện đang có quyết định <strong>xử lý vi phạm / khấu trừ điểm</strong>:
                </p>
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Điểm học thuật:</span>
                    <span className="font-semibold">{academicScore.toFixed(2)} / 10</span>
                  </div>
                  <div className="flex justify-between text-destructive">
                    <span>Mức khấu trừ đang áp dụng:</span>
                    <span className="font-semibold">
                      {submission.integrityReview?.penaltyMode === 'FIXED'
                        ? `-${Number(submission.integrityReview?.penaltyAmount ?? submission.integrityReview?.deductedScore ?? 0).toFixed(2)} điểm`
                        : `${submission.integrityReview?.penaltyPercent ?? 0}% (-${Number(submission.integrityReview?.deductedScore ?? 0).toFixed(2)})`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Điểm cuối hiện tại:</span>
                    <span className="font-semibold">{Number(submission.integrityReview?.finalScore ?? finalScore).toFixed(2)} / 10</span>
                  </div>
                </div>
                <p className="text-muted-foreground">
                  Khi bạn xác nhận <strong>Loại trừ tín hiệu</strong>, toàn bộ quyết định xử lý và mức khấu trừ điểm trên sẽ bị <strong>mất đi</strong>, điểm của sinh viên sẽ được khôi phục về điểm học thuật ban đầu (<strong>{academicScore.toFixed(2)} / 10</strong>).
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isSaving}
              onClick={confirmDismiss}
            >
              Xác nhận loại trừ & khôi phục điểm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}


