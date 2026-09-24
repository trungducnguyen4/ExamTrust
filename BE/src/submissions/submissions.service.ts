import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException, ConflictException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import * as path from 'path';
import * as PDFDocument from 'pdfkit';

// pdfkit's built-in standard fonts (Helvetica etc.) only cover WinAnsi and
// cannot render Vietnamese diacritics. DejaVu Sans has full Vietnamese
// Unicode coverage, so we embed it for the exam-results PDF export.
const VN_FONT_DIR = path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');
const VN_FONT_REGULAR = path.join(VN_FONT_DIR, 'DejaVuSans.ttf');
const VN_FONT_BOLD = path.join(VN_FONT_DIR, 'DejaVuSans-Bold.ttf');
import { PrismaService } from '../prisma/prisma.service';
import { isIpInAnyCidr, normalizeIp } from '../common/utils/ip.utils';
import { AccessPolicyService } from '../common/services/access-policy.service';
import { StartExamDto, SubmitExamDto, GradeAnswerDto, UpdateSubmissionStatusDto, AutosaveExamDto } from './dto/submission.dto';
import { PaginationDto, buildPaginatedResult } from '../common/dto/pagination.dto';
import { SubmissionsEventsService } from './submissions-events.service';
import { QueueService } from '../queue/queue.service';
import { ProctoringEvidenceService } from './proctoring-evidence.service';
import { AiService } from '../ai/ai.service';
import { getIntegrityEventCategory, getIntegrityEventLabel, getIntegrityEventSeverity } from './integrity-event-catalog';

type AutosaveAnswerMeta = {
  questionId: string;
  sequence: number;
  clientBatchId?: string | null;
  serverVersion?: number | null;
};

type ExistingAutosaveAnswer = {
  id: string;
  questionId: string;
  sequence: number;
};

type SnapshotQuestion = {
  questionId: string;
  questionVersionId: string | null;
  questionSnapshotId: string | null;
  orderIndex: number;
  type: string;
  stem: string;
  answerKey: any;
  explanation?: string | null;
  assignedScore: number;
};

type DuringReviewFeedback = {
  questionId: string;
  unavailable?: boolean;
  pointsAwarded?: number;
  maxPoints?: number;
  isCorrect?: boolean;
  correctAnswer?: any;
  explanation?: string;
};

type IntegrityCaseConfidence = 'High' | 'Medium' | 'Low';
type IntegrityCaseStatus = 'pending' | 'reviewed' | 'dismissed' | 'confirmed';
type IntegrityReasonType = 'similarity' | 'timing' | 'pattern' | 'behavior';

type IntegrityCasesQuery = {
  page?: string | number;
  limit?: string | number;
  search?: string;
  confidence?: string;
  examTitle?: string;
  examId?: string;
  courseId?: string;
  term?: string;
  academicYear?: string;
  submittedFrom?: string;
  submittedTo?: string;
  timeAnomaly?: string | boolean;
  status?: string;
  submissionId?: string;
};

type IntegrityCase = {
  id: string;
  submissionId: string;
  attemptNo: number | null;
  studentId: string;
  studentName: string;
  examId: string;
  examTitle: string;
  courseId?: string | null;
  academicYear?: string | null;
  term?: string | null;
  submittedAt: string;
  confidence: IntegrityCaseConfidence;
  status: IntegrityCaseStatus;
  academicScore?: number;
  integrityReview?: {
    status: IntegrityCaseStatus;
    reviewerNote?: string | null;
    decidedAt?: Date | null;
    penaltyMode?: string | null;
    penaltyPercent?: number | null;
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
      createdAt: Date;
    }>;
  } | null;
  reasons: Array<{
    type: IntegrityReasonType;
    description: string;
    weight: number;
    evidence?: string;
  }>;
  similarityScore?: number;
  timeAnomaly?: boolean;
  patternMatch?: string[];
};

type RequestUser = {
  id: string;
  role: 'ADMIN' | 'LECTURER' | 'STUDENT';
};

const AUTO_GRADED_TYPES = new Set(['MULTIPLE_CHOICE', 'MULTI_SELECT', 'TRUE_FALSE', 'FIND_ERROR']);

// Event types that must be recorded even when the exam has no full
// proctoring configured (no screenshot/webcam evidence involved), unlike
// tab_switch/camera/face-detection which require proctoring to be enabled.
const ALWAYS_RECORDED_EVENT_TYPES = new Set(['network_disconnected', 'network_restored']);

@Injectable()
export class SubmissionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubmissionsService.name);
  private expiredSubmissionTimer?: NodeJS.Timeout;
  constructor(
    private prisma: PrismaService,
    private submissionsEvents: SubmissionsEventsService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly queueService: QueueService,
    private readonly aiService: AiService,
  ) {}

  onModuleInit() {
    const run = () => this.finalizeExpiredSubmissions().catch((error) => {
      this.logger.error('finalizeExpiredSubmissions run failed', error?.stack || error);
    });
    run();
    this.expiredSubmissionTimer = setInterval(run, 60_000);
  }

  onModuleDestroy() {
    if (this.expiredSubmissionTimer) clearInterval(this.expiredSubmissionTimer);
  }

  private async getLatestExamSnapshotId(examId: string): Promise<string | null> {
    try {
      const latestSnapshot = await this.prisma.examSnapshot.findFirst({
        where: { examId },
        orderBy: { publishedAt: 'desc' },
        select: { id: true },
      });
      return latestSnapshot?.id ?? null;
    } catch (error: any) {
      if (error?.code === 'P2021') {
        return null;
      }
      throw error;
    }
  }

  // 'low' | 'medium' | 'high' here, not the canonical 'low' | 'warning' |
  // 'critical' scale — this is the wire shape the SSE payload and
  // ExamMonitor.tsx's realtime handler already expect (see
  // SubmissionsEventsService.emitIntegrityEvent), so map at the boundary
  // instead of changing that contract.
  private getRealtimeSeverity(eventType: string): 'low' | 'medium' | 'high' {
    const severity = getIntegrityEventSeverity(eventType);
    return severity === 'critical' ? 'high' : severity === 'warning' ? 'medium' : 'low';
  }

  private clampPercent(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
  }

  /**
   * Keep timing-integrity analysis aligned with the server's existing exam
   * configuration precedence. A timing signal is advisory evidence only.
   */
  private getConfiguredTimeLimitMinutes(exam: {
    timeLimitMinutes?: number | null;
    duration?: number | null;
    settings?: unknown;
  }): number | null {
    const settings = exam.settings && typeof exam.settings === 'object' ? exam.settings as any : {};
    const value = exam.timeLimitMinutes ?? settings.timeLimitMinutes ?? exam.duration;
    const minutes = Number(value);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
  }

  private getFastCompletionSignal(input: {
    startedAt?: Date | string | null;
    submittedAt?: Date | string | null;
    score?: unknown;
    exam: { timeLimitMinutes?: number | null; duration?: number | null; settings?: unknown };
  }): {
    severity: 'REVIEW' | 'HIGH';
    elapsedMinutes: number;
    allowedMinutes: number;
    completionRatio: number;
    scorePct: number;
    reasons: string[];
  } | null {
    const allowedMinutes = this.getConfiguredTimeLimitMinutes(input.exam);
    if (!allowedMinutes || !input.startedAt || !input.submittedAt) return null;

    const elapsedMs = new Date(input.submittedAt).getTime() - new Date(input.startedAt).getTime();
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;

    const elapsedMinutes = Number((elapsedMs / 60_000).toFixed(1));
    const completionRatio = Number((elapsedMinutes / allowedMinutes).toFixed(3));
    const scorePct = Number((this.clampPercent(this.toNumber(input.score) * 10)).toFixed(1));
    const severity = completionRatio <= 0.15 && scorePct >= 95
      ? 'HIGH'
      : completionRatio <= 0.25 && scorePct >= 90
        ? 'REVIEW'
        : null;
    if (!severity) return null;

    return {
      severity,
      elapsedMinutes,
      allowedMinutes,
      completionRatio,
      scorePct,
      reasons: [
        `Hoàn thành trong ${(completionRatio * 100).toFixed(1)}% thời lượng cho phép`,
        `Điểm đạt ${scorePct.toFixed(1)}%`,
      ],
    };
  }

  /**
   * Finds only pairs that share a rare wrong option bucket. This deliberately
   * avoids comparing every student pair, and never treats matching correct
   * answers as suspicious evidence.
   */
  private buildSimilarAnswerPairs(input: {
    answers: Array<{
      submissionId: string;
      questionId: string;
      questionVersionId?: string | null;
      questionSnapshotId?: string | null;
      answer: unknown;
      isCorrect?: boolean | null;
    }>;
    studentsBySubmissionId: Map<string, { studentId: string; studentName: string; studentCode: string | null }>;
    orderIndexByQuestionVersionId: Map<string, number>;
  }): Array<{
    studentA: { submissionId: string; studentId: string; studentName: string; studentCode: string | null };
    studentB: { submissionId: string; studentId: string; studentName: string; studentCode: string | null };
    similarityScore: number;
    rareWrongMatches: number;
    comparableQuestions: number;
    evidence: Array<{
      questionIdentity: string;
      questionId: string;
      orderIndex: number | null;
      answer: string;
      answerCount: number;
      answerFrequency: number;
      weight: number;
    }>;
    severity: 'REVIEW' | 'HIGH';
  }> {
    type ComparableAnswer = {
      submissionId: string;
      questionId: string;
      questionVersionId: string | null;
      questionIdentity: string;
      selectedLetter: string;
      isCorrect: boolean;
    };
    const answersBySubmission = new Map<string, Map<string, ComparableAnswer>>();
    const responsesByQuestion = new Map<string, Map<string, ComparableAnswer>>();

    for (const row of input.answers) {
      const selectedLetter = this.extractSingleAnswerLetter(row.answer);
      const questionIdentity = row.questionSnapshotId || row.questionVersionId || null;
      if (!selectedLetter || !questionIdentity) continue;
      const comparable: ComparableAnswer = {
        submissionId: row.submissionId,
        questionId: row.questionId,
        questionVersionId: row.questionVersionId || null,
        questionIdentity,
        selectedLetter,
        isCorrect: Boolean(row.isCorrect),
      };
      const byQuestion = responsesByQuestion.get(questionIdentity) || new Map<string, ComparableAnswer>();
      byQuestion.set(row.submissionId, comparable);
      responsesByQuestion.set(questionIdentity, byQuestion);
      const bySubmission = answersBySubmission.get(row.submissionId) || new Map<string, ComparableAnswer>();
      bySubmission.set(questionIdentity, comparable);
      answersBySubmission.set(row.submissionId, bySubmission);
    }

    type Evidence = {
      questionIdentity: string;
      questionId: string;
      questionVersionId: string | null;
      answer: string;
      answerCount: number;
      answerFrequency: number;
      weight: number;
    };
    const candidates = new Map<string, { submissionA: string; submissionB: string; evidence: Evidence[] }>();
    for (const [questionIdentity, responses] of responsesByQuestion) {
      const responseCount = responses.size;
      const wrongBuckets = new Map<string, ComparableAnswer[]>();
      for (const response of responses.values()) {
        if (response.isCorrect) continue;
        const bucket = wrongBuckets.get(response.selectedLetter) || [];
        bucket.push(response);
        wrongBuckets.set(response.selectedLetter, bucket);
      }
      for (const [answer, bucket] of wrongBuckets) {
        const answerFrequency = bucket.length / Math.max(1, responseCount);
        if (answerFrequency > 0.1) continue;
        const weight = Number(Math.log((responseCount + 1) / (bucket.length + 1)).toFixed(3));
        for (let left = 0; left < bucket.length; left += 1) {
          for (let right = left + 1; right < bucket.length; right += 1) {
            const submissionA = bucket[left].submissionId;
            const submissionB = bucket[right].submissionId;
            const key = submissionA < submissionB ? `${submissionA}|${submissionB}` : `${submissionB}|${submissionA}`;
            const candidate = candidates.get(key) || {
              submissionA: submissionA < submissionB ? submissionA : submissionB,
              submissionB: submissionA < submissionB ? submissionB : submissionA,
              evidence: [],
            };
            candidate.evidence.push({
              questionIdentity,
              questionId: bucket[left].questionId,
              questionVersionId: bucket[left].questionVersionId,
              answer,
              answerCount: bucket.length,
              answerFrequency: Number(answerFrequency.toFixed(3)),
              weight,
            });
            candidates.set(key, candidate);
          }
        }
      }
    }

    return Array.from(candidates.values())
      .map((candidate) => {
        const answersA = answersBySubmission.get(candidate.submissionA) || new Map();
        const answersB = answersBySubmission.get(candidate.submissionB) || new Map();
        const common = Array.from(answersA.keys()).filter((key) => answersB.has(key));
        const sameAnswerCount = common.filter((key) => answersA.get(key)?.selectedLetter === answersB.get(key)?.selectedLetter).length;
        const studentA = input.studentsBySubmissionId.get(candidate.submissionA);
        const studentB = input.studentsBySubmissionId.get(candidate.submissionB);
        if (!studentA || !studentB) return null;
        if (candidate.evidence.length < 3 || common.length < 10) return null;
        // Chi tiết từng câu mà cả hai chọn CÙNG một đáp án (đúng hoặc sai).
        // Bên phân biệt đúng/sai, chỉ cần trùng pattern (cùng đáp án) là nổi bật.
        const matched = common
          .filter((key) => {
            const a = answersA.get(key);
            const b = answersB.get(key);
            return a?.selectedLetter && a.selectedLetter === b?.selectedLetter;
          })
          .map((key) => {
            const a = answersA.get(key)!;
            return {
              questionIdentity: key,
              questionId: a.questionId,
              orderIndex: a.questionVersionId
                ? input.orderIndexByQuestionVersionId.get(a.questionVersionId) ?? null
                : null,
              letter: a.selectedLetter,
              isCorrect: Boolean(a.isCorrect),
            };
          })
          .sort((x, y) => (x.orderIndex ?? Number.MAX_SAFE_INTEGER) - (y.orderIndex ?? Number.MAX_SAFE_INTEGER));
        return {
          studentA: { submissionId: candidate.submissionA, ...studentA },
          studentB: { submissionId: candidate.submissionB, ...studentB },
          similarityScore: Number(((sameAnswerCount / common.length) * 100).toFixed(1)),
          rareWrongMatches: candidate.evidence.length,
          comparableQuestions: common.length,
          matchedBreakdown: {
            total: matched.length,
            correctMatches: matched.filter((m) => m.isCorrect),
            wrongMatches: matched.filter((m) => !m.isCorrect),
          },
          evidence: candidate.evidence
            .map((item) => ({
              ...item,
              orderIndex: item.questionVersionId ? input.orderIndexByQuestionVersionId.get(item.questionVersionId) ?? null : null,
            }))
            .sort((a, b) => b.weight - a.weight),
          severity: candidate.evidence.length >= 4 ? 'HIGH' as const : 'REVIEW' as const,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .sort((a, b) => b.rareWrongMatches - a.rareWrongMatches || b.similarityScore - a.similarityScore);
  }

  private seededRandom(seed: string): () => number {
    let counter = 0;

    return () => {
      const hash = createHash('sha256')
        .update(seed)
        .update(':')
        .update(String(counter++))
        .digest();
      return hash.readUInt32BE(0) / 0x100000000;
    };
  }

  private shuffleWithSeed<T>(items: T[], seed: string): T[] {
    const result = [...items];
    const random = this.seededRandom(seed);

    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
  }

  /**
   * The backend is the clock authority.  An attempt cannot outlive either its
   * own duration or the scheduled exam window, whichever ends first.
   */
  private resolveSubmissionDeadline(submission: {
    startedAt?: Date | null;
    deadlineOverrideAt?: Date | null;
    exam?: { endTime?: Date | null; timeLimitMinutes?: number | null; duration?: number | null } | null;
  }): Date | null {
    if (submission.deadlineOverrideAt) return new Date(submission.deadlineOverrideAt);
    const candidates: Date[] = [];
    const scheduledEnd = submission.exam?.endTime;
    if (scheduledEnd) candidates.push(new Date(scheduledEnd));

    const limitMinutes = submission.exam?.timeLimitMinutes ?? submission.exam?.duration;
    if (submission.startedAt && limitMinutes && Number(limitMinutes) > 0) {
      candidates.push(new Date(new Date(submission.startedAt).getTime() + Number(limitMinutes) * 60_000));
    }

    if (candidates.length === 0) return null;
    return new Date(Math.min(...candidates.map((date) => date.getTime())));
  }

  /**
   * Finalizes attempts whose server-owned deadline has elapsed. The normal
   * submit path is reused so saved answers, scoring, snapshots and instances
   * retain exactly the same semantics as a browser-initiated auto-submit.
   */
  async finalizeExpiredSubmissions(): Promise<number> {
    const now = new Date();
    const candidates = await this.prisma.examSubmission.findMany({
      where: { status: 'IN_PROGRESS' },
      select: {
        id: true,
        studentId: true,
        startedAt: true,
        deadlineOverrideAt: true,
        exam: {
          select: {
            endTime: true,
            timeLimitMinutes: true,
            duration: true,
          },
        },
      },
      take: 500,
      orderBy: { startedAt: 'asc' },
    });

    let finalized = 0;
    for (const submission of candidates) {
      const deadline = this.resolveSubmissionDeadline(submission);
      if (!deadline || deadline.getTime() > now.getTime()) continue;

      try {
        await this.submitExam(submission.id, { answers: [] }, submission.studentId);
        finalized += 1;
      } catch (error) {
        // The submit path atomically locks the row. A competing browser or
        // another app instance may finish it first; the next interval retries
        // only rows that remain IN_PROGRESS.
        if (!(error instanceof ConflictException) && !(error instanceof BadRequestException)) {
          // Candidates are processed oldest-`startedAt`-first — letting an
          // unexpected error here escape the loop would abort every OTHER
          // expired submission behind this one too, leaving them stuck
          // IN_PROGRESS (and their "thời gian làm bài" climbing) until this
          // one poison record is somehow fixed. Log and keep going instead.
          this.logger.error(
            `finalizeExpiredSubmissions: failed to auto-submit ${submission.id}`,
            (error as any)?.stack || error,
          );
        }
      }
    }

    return finalized;
  }

  sanitizeStudentSubmissionView(submission: any) {
    const resultsPublished = Boolean(submission?.exam?.resultsPublishedAt);
    const reviewSettings = submission?.exam?.reviewSettings ?? submission?.exam?.settings?.reviewSettings;
    const afterReview = reviewSettings?.enabled && reviewSettings?.phases?.after
      ? reviewSettings.phases.after
      : null;
    const canShowScore = resultsPublished && (afterReview ? Boolean(afterReview.showScore) : true);
    // Older exams only had "showAnswers", which used to gate both right/wrong
    // AND the answer key together — fall back to it so those exams keep
    // behaving exactly as before instead of silently hiding correctness.
    const canShowCorrectness = resultsPublished && (afterReview ? Boolean(afterReview.showCorrectness ?? afterReview.showAnswers) : true);
    const canShowAnswers = resultsPublished && (afterReview ? Boolean(afterReview.showAnswers) : true);
    const canShowFeedback = resultsPublished && (afterReview ? Boolean(afterReview.showFeedback) : true);
    // Independent of resultsPublished/canShowScore on purpose — this is a
    // separate lecturer decision about whether the question-by-question
    // review (content, the student's own answer) is ever visible at all, not
    // about when the score becomes official. Defaults to true so exams saved
    // before this field existed keep behaving exactly as they always did.
    const canReviewAnswers = reviewSettings?.enabled ? Boolean(reviewSettings?.allowSubmissionReview ?? true) : true;
    // Provisional reveal (proposal in docs/grading-publish-flow-trace.md §5):
    // when the lecturer turned on "show result immediately" but the exam has
    // manual-graded questions blocking auto-publish, the auto-gradable part is
    // already fully known at submit time — there's no reason to hide it. Only
    // the manual-graded questions and the combined final score stay pending.
    // The answer key text/explanation still wait for official publish (unlike
    // correctness/score, those double as "what's the right answer" reveal).
    const showResultImmediately = Boolean((submission?.exam?.settings as any)?.showResultImmediately);
    const autoProvisionalReveal = !resultsPublished && showResultImmediately;
    let autoRawScore = 0;
    let autoRawMax = 0;
    let hasAutoGradableAnswer = false;
    let pendingManualCount = 0;
    const answers = Array.isArray(submission?.answers) ? submission.answers.map((answer: any) => {
      const snapshot = this.parseJsonValue(answer?.questionSnapshot?.payload, {});
      const question = answer?.question || {};
      const { correctAnswer: _correctAnswer, explanation: _explanation, ...safeQuestion } = question;
      const answerKey = snapshot.answerKey ?? snapshot.correctAnswer;
      const autoGradable = this.isAutoGradable(
        String(snapshot.type ?? question.type ?? ''),
        answerKey,
      );
      const manualGradeAvailable = Boolean(answer?.manualGradedAt);
      const autoRevealed = autoGradable && (canShowCorrectness || autoProvisionalReveal);
      const showCorrectnessReview = autoRevealed;
      const showAnswerReview = canShowAnswers && autoGradable;
      const showScoreReview = autoGradable
        ? (canShowScore || autoProvisionalReveal)
        : (canShowScore && manualGradeAvailable);
      const showFeedbackReview = canShowFeedback && (autoGradable || manualGradeAvailable);
      const assignedScore = this.toNumber(
        snapshot.assignedScore ?? snapshot.points ?? question.points ?? question.defaultPoints,
        0,
      );

      if (autoGradable) {
        hasAutoGradableAnswer = true;
        autoRawMax += assignedScore;
        autoRawScore += this.toNumber(answer?.pointsAwarded, 0);
      } else if (!manualGradeAvailable) {
        pendingManualCount += 1;
      }

      return {
        ...answer,
        questionSnapshot: undefined,
        gradingMode: autoGradable ? 'AUTO' : 'MANUAL',
        maxPoints: assignedScore,
        ...(showCorrectnessReview ? {} : { isCorrect: undefined }),
        ...(showScoreReview ? {} : { pointsAwarded: undefined, manualGradedAt: undefined }),
        ...(showFeedbackReview ? {} : { feedback: undefined }),
        // Content is stripped separately from the score fields above — a
        // submission with review disabled must still contribute correct
        // pointsAwarded/isCorrect to the score-summary cards, it just never
        // surfaces what was asked or answered.
        ...(canReviewAnswers ? {} : { answer: undefined, feedback: undefined }),
        question: {
          ...safeQuestion,
          content: canReviewAnswers ? (snapshot.stem ?? snapshot.content ?? safeQuestion.content) : undefined,
          options: canReviewAnswers ? (snapshot.options ?? safeQuestion.options) : undefined,
          ...(showAnswerReview && canReviewAnswers && typeof answerKey !== 'undefined' ? { correctAnswer: answerKey } : {}),
          ...(showFeedbackReview && canReviewAnswers && autoGradable && typeof snapshot.explanation !== 'undefined'
            ? { explanation: snapshot.explanation }
            : {}),
        },
      };
    }) : [];

    const adjustmentTotal = (submission?.scoreAdjustments || [])
      .filter((adjustment: any) => !adjustment.revokedAt)
      .reduce((total: number, adjustment: any) => total + this.toNumber(adjustment.amount), 0);
    // A confirmed integrity penalty's finalScore is the true official score —
    // plain score+adjustments would show the pre-penalty number (see
    // docs/integrity-penalty-flow-trace.md §3). Only meaningful once
    // published; checked against the raw (ungated) integrityReview since the
    // gated copy below hasn't been built yet at this point.
    const integrityFinalScoreForTotal = canShowScore && String(submission?.integrityReview?.status || '').toUpperCase() === 'CONFIRMED'
      ? submission?.integrityReview?.finalScore
      : null;
    const adjustedScore = integrityFinalScoreForTotal != null
      ? this.toNumber(integrityFinalScoreForTotal)
      : Number(Math.max(0, Math.min(10, this.toNumber(submission?.score) + adjustmentTotal)).toFixed(2));

    // Independent of canShowScore/score on purpose — see the comment above the
    // answers map. Never computed once results are already published, since
    // `score` already carries the full, official value at that point.
    const provisionalScore = autoProvisionalReveal && hasAutoGradableAnswer
      ? this.normalizeScore(autoRawScore, autoRawMax)
      : null;

    // The integrity decision itself (status + reviewer's reason) is never a
    // secret — telling a student "you're confirmed for a violation, here's
    // why" doesn't leak anything about their score. The actual deduction
    // amounts, though, are part of the score and must wait for publish like
    // everything else, so a student can't back-calculate their pre-penalty
    // score from academicScore/deductedScore before results are official.
    const integrityReview = submission?.integrityReview
      ? {
          ...submission.integrityReview,
          ...(canShowScore ? {} : {
            penaltyMode: null,
            penaltyPercent: null,
            penaltyAmount: null,
            academicScore: null,
            deductedScore: null,
            finalScore: null,
            penaltyAppliedAt: null,
          }),
        }
      : submission?.integrityReview;

    // Same reasoning as integrityReview above: the adjustment amounts are
    // part of the score and wait for publish, but hiding them entirely
    // pre-publish (rather than leaking the list with the total blanked out)
    // keeps the gating consistent across every score-affecting record.
    return {
      ...submission,
      answers,
      integrityReview,
      scoreAdjustments: canShowScore ? submission?.scoreAdjustments : [],
      canReviewAnswers,
      provisionalScore,
      pendingManualCount,
      ...(canShowScore
        ? { academicScore: submission.score, adjustmentTotal: Number(adjustmentTotal.toFixed(2)), score: adjustedScore }
        : { score: null, gradedAt: null }),
    };
  }

  private getDuringReviewSettings(reviewSettings: any) {
    const during = reviewSettings?.enabled && reviewSettings?.phases?.during;
    return {
      enabled: Boolean(during),
      // Exams saved before "showCorrectness" existed only had "showAnswers",
      // which used to cover both right/wrong AND the answer key together —
      // fall back to it so those exams keep behaving exactly as before.
      showCorrectness: Boolean(during?.showCorrectness ?? during?.showAnswers),
      showScore: Boolean(during?.showScore),
      showAnswers: Boolean(during?.showAnswers),
      showFeedback: Boolean(during?.showFeedback),
    };
  }

  private buildDuringReviewFeedback(
    question: SnapshotQuestion,
    answer: any,
    reviewSettings: any,
  ): DuringReviewFeedback | null {
    const policy = this.getDuringReviewSettings(reviewSettings);
    if (!policy.enabled) return null;

    if (!this.isAutoGradable(question.type, question.answerKey)) {
      return { questionId: question.questionId, unavailable: true };
    }

    const isCorrect = this.compareAnswers(answer, question.answerKey, question.type);
    const feedback: DuringReviewFeedback = { questionId: question.questionId };
    if (policy.showScore) {
      feedback.pointsAwarded = isCorrect ? question.assignedScore : 0;
      feedback.maxPoints = question.assignedScore;
    }
    if (policy.showCorrectness) {
      feedback.isCorrect = isCorrect;
    }
    if (policy.showAnswers) {
      feedback.correctAnswer = question.answerKey;
    }
    if (policy.showFeedback && question.explanation) {
      feedback.explanation = question.explanation;
    }
    return feedback;
  }

  private sanitizeExamInstanceForStudent(instance: any, webcamEvidencePolicy?: any) {
    if (!instance) return instance;
    const snapshotPayload = this.parseJsonValue(instance.snapshotPayload, {});
    return {
      ...instance,
      snapshotPayload: {
        webcamEvidencePolicy:
          snapshotPayload?.webcamEvidencePolicy ?? webcamEvidencePolicy ?? null,
      },
    };
  }

  private parseLogDetails(details: string | null | undefined): any {
    if (!details) return null;
    try {
      return JSON.parse(details);
    } catch {
      return null;
    }
  }

  private getIntegrityLogWeight(eventType: string): number {
    const event = String(eventType || '').toLowerCase();
    if (event === 'fullscreen_exit' || event === 'face_not_detected' || event === 'multi_monitor_detected') return 25;
    if (['paste', 'copy', 'window_blur', 'tab_switch', 'multi_monitor_at_start'].includes(event)) return 15;
    return 5;
  }

  private getIntegrityConfidence(
    tabSwitchCount: number,
    mouseAnomalies: number,
    riskScore: number,
  ): IntegrityCaseConfidence {
    if (tabSwitchCount >= 5 || mouseAnomalies >= 8 || riskScore >= 70) return 'High';
    if (tabSwitchCount >= 2 || mouseAnomalies >= 3 || riskScore >= 35) return 'Medium';
    return 'Low';
  }

  private isTimingAnomalyLog(eventType: string, details?: string | null): boolean {
    const text = `${eventType || ''} ${details || ''}`.toLowerCase();
    return ['idle', 'rapid', 'time', 'inactive'].some((keyword) => text.includes(keyword));
  }

  private buildIntegrityLogReason(eventType: string, count: number): IntegrityCase['reasons'][number] | null {
    const event = String(eventType || '').toLowerCase();
    // tab_switch/mouse_idle/mouse_anomaly already get their own aggregate
    // reason (one row summarizing the whole session's count) from the
    // caller above — skip them here to avoid a duplicate row per type.
    if (['tab_switch', 'mouse_idle', 'mouse_anomaly'].includes(event)) return null;
    // Anything the shared catalog considers informational-only (exam_start,
    // submit, focus regained, camera/screen restored, ...) isn't worth
    // surfacing as an integrity "reason".
    if (getIntegrityEventSeverity(event) === 'low') return null;

    return {
      type: this.isTimingAnomalyLog(event) ? 'timing' : 'behavior',
      // Same wording the case-detail timeline uses for this eventType
      // (getSubmissionTimeline) — previously this method had its own
      // 5-entry label table with different phrasing, and silently dropped
      // the other ~9 suspicious eventTypes entirely (they still counted
      // toward the risk score but never appeared as a "reason").
      description: getIntegrityEventLabel(event),
      weight: Math.min(1, this.getIntegrityLogWeight(event) / 100),
      evidence: `Đã ghi nhận ${count} sự kiện`,
    };
  }

  private publishRealtimeLogs(
    examId: string,
    submissionId: string,
    student: { id?: string; fullName?: string; studentId?: string },
    logs: Array<{ type: string; details?: any; ts?: number }>,
    attemptNo?: number | null,
  ) {
    const suspiciousTypes = new Set([
      'tab_switch',
      'mouse_anomaly',
      'mouse_idle',
      'copy',
      'paste',
      'fullscreen_exit',
      'window_blur',
      'face_not_detected',
      'camera_stream_ended',
      'camera_recovery_timeout',
      'multi_monitor_detected',
      'multi_monitor_at_start',
    ]);

    for (const entry of logs || []) {
      const eventType = String(entry?.type || '').toLowerCase();
      if (!suspiciousTypes.has(eventType)) continue;

      const id = `${submissionId}-${eventType}-${entry?.ts || Date.now()}`;
      this.submissionsEvents.emitIntegrityEvent(examId, {
        id,
        submissionId,
        eventType,
        label: getIntegrityEventLabel(eventType),
        details: entry?.details ? String(entry.details) : eventType,
        timestamp: new Date(entry?.ts || Date.now()).toISOString(),
        severity: this.getRealtimeSeverity(eventType),
        attemptNo,
        student,
      });
    }
  }

  async startExam(startExamDto: StartExamDto, studentId: string, context?: { userAgent?: string }): Promise<any> {
    const exam = await this.prisma.exam.findUnique({
      where: { id: startExamDto.examId },
      include: {
        course: true,
      },
    });

    if (!exam) {
      throw new NotFoundException('Không tìm thấy bài thi');
    }

    const settings: any = exam.settings || {};
    const configuredAttempts = exam.maxAttempts ?? settings.maxAttempts ?? null;
    const configuredTimeLimit = exam.timeLimitMinutes ?? settings.timeLimitMinutes ?? exam.duration;
    // Old exams retain their settings. New exams persist this value explicitly.
    const proctoringEnabled = settings.proctoringEnabled === undefined
      ? Boolean(settings.requiresProctoring)
      : Boolean(settings.proctoringEnabled);
    const requiresDesktop = proctoringEnabled && configuredAttempts !== null && configuredTimeLimit !== null;
    const webcamPolicyInput = settings.webcamEvidencePolicy;
    const webcamEvidenceEnabled = Boolean(webcamPolicyInput?.enabled) && String(webcamPolicyInput?.examProfile || '').toUpperCase() === 'THEORY';
    if (webcamEvidenceEnabled && !startExamDto.webcamReady) {
      throw new ForbiddenException('Bài thi này yêu cầu bật webcam và đồng ý giám sát trước khi bắt đầu.');
    }
    const ua = String(context?.userAgent || '');
    const isMobileOrTablet = Boolean(startExamDto.isMobileOrTablet) || /android|iphone|ipad|ipod|mobile|tablet|silk|kindle/i.test(ua);
    if (requiresDesktop && isMobileOrTablet) {
      throw new ForbiddenException('Bài thi có giám sát này yêu cầu sử dụng máy tính (laptop hoặc desktop).');
    }

    // Check if student is enrolled
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        studentId,
        courseId: exam.courseId,
        status: 'active',
      },
    });

    if (!enrollment) {
      throw new ForbiddenException('Bạn chưa được ghi danh vào khóa học này');
    }

    // Check if exam is available
    if (exam.status !== 'PUBLISHED' && exam.status !== 'ONGOING') {
      throw new ForbiddenException('Bài thi hiện không khả dụng');
    }

    const now = new Date();
    if (exam.startTime && exam.startTime > now) {
      throw new ForbiddenException('Bài thi chưa bắt đầu');
    }

    const allowLateSubmission = Boolean((exam.settings as any)?.allowLateSubmission);
    if (!allowLateSubmission && exam.endTime && exam.endTime < now) {
      throw new ForbiddenException('Bài thi đã kết thúc');
    }

    const latestSnapshot = await this.prisma.examSnapshot.findFirst({
      where: { examId: startExamDto.examId },
      orderBy: { publishedAt: 'desc' },
      include: {
        questions: {
          include: {
            questionSnapshot: true,
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!latestSnapshot || !Array.isArray(latestSnapshot.questions) || latestSnapshot.questions.length === 0) {
      throw new ConflictException('Không có bản lưu đề thi. Vui lòng yêu cầu giảng viên công bố lại bài thi.');
    }

    // Check for in-progress submission (idempotency: return existing IN_PROGRESS)
    const inProgressSubmission = await this.prisma.examSubmission.findFirst({
      where: {
        examId: startExamDto.examId,
        studentId,
        status: 'IN_PROGRESS',
      },
    });

    if (inProgressSubmission) {
      const examInstance = await this.prisma.examInstance.upsert({
        where: {
          examId_studentId: {
            examId: startExamDto.examId,
            studentId,
          },
        },
        create: {
          examId: startExamDto.examId,
          studentId,
          examSnapshotId: latestSnapshot.id,
          status: 'IN_PROGRESS',
          startedAt: inProgressSubmission.startedAt || now,
          lastActivityAt: now,
          userAgent: context?.userAgent ?? null,
        },
        update: {
          status: 'IN_PROGRESS',
          lastActivityAt: now,
          userAgent: context?.userAgent ?? undefined,
        },
      });
      const updatedSubmission = await this.prisma.examSubmission.update({
        where: { id: inProgressSubmission.id },
        data: {
          examSnapshotId: inProgressSubmission.examSnapshotId || latestSnapshot.id,
          examInstanceId: inProgressSubmission.examInstanceId || examInstance.id,
          lastActivityAt: now,
        },
        include: {
          exam: {
            select: {
              id: true,
              title: true,
              duration: true,
            },
          },
          examInstance: true,
          proctoring: true,
        },
      });

      if (process.env.NODE_ENV !== 'production') {
        console.log('[exam:start]', {
          examId: startExamDto.examId,
          studentId,
          sessionId: updatedSubmission.id,
          examInstanceId: updatedSubmission.examInstanceId,
          status: updatedSubmission.status,
        });
      }

      const securityState = await this.getStudentSecurityState(updatedSubmission.id);

      return {
        ...updatedSubmission,
        resumed: true,
        deadline: this.resolveSubmissionDeadline({
          startedAt: updatedSubmission.startedAt,
          deadlineOverrideAt: updatedSubmission.deadlineOverrideAt,
          exam,
        })?.toISOString() ?? null,
        securityState,
        examInstance: this.sanitizeExamInstanceForStudent(
          updatedSubmission.examInstance,
          ProctoringEvidenceService.normalizePolicy(webcamPolicyInput),
        ),
      };
    }

    const examSettings: any = exam.settings || {};
    let snapshotQuestions = Array.isArray(latestSnapshot?.questions)
      ? [...latestSnapshot.questions]
      : [];
    const shouldShuffleQuestions = Boolean(
      examSettings?.shuffleQuestions ||
        examSettings?.questionSelectionConfig?.shuffleQuestions,
    );
    const randomizationSeed = randomUUID();

    if (shouldShuffleQuestions) {
      snapshotQuestions = this.shuffleWithSeed(
        snapshotQuestions,
        `${randomizationSeed}:questions`,
      );
    }

    const mappedSnapshotQuestions = this.mapSnapshotQuestions(snapshotQuestions);

    const webcamEvidencePolicy = ProctoringEvidenceService.normalizePolicy(
      webcamPolicyInput,
      randomizationSeed,
      exam.timeLimitMinutes ?? exam.duration,
    );
    const snapshotPayload = {
      examId: exam.id,
      examSnapshotId: latestSnapshot.id,
      randomizationSeed,
      timeLimitMinutes: exam.timeLimitMinutes ?? exam.duration,
      maxAttempts:
        exam.maxAttempts ?? (examSettings?.maxAttempts !== undefined && examSettings?.maxAttempts !== null
          ? Number(examSettings.maxAttempts)
          : null),
      gradingStrategy: exam.gradingStrategy ?? examSettings?.gradingStrategy ?? 'HIGHEST',
      reviewSettings: exam.reviewSettings ?? examSettings?.reviewSettings ?? null,
      proctoringEnabled: requiresDesktop,
      webcamEvidencePolicy,
      questionSelectionConfig:
        exam.questionSelectionConfig ?? examSettings?.questionSelectionConfig ?? null,
      questions: mappedSnapshotQuestions.map((item) => ({
        questionId: item.questionId,
        questionVersionId: item.questionVersionId ?? null,
        questionSnapshotId: item.questionSnapshotId ?? null,
        orderIndex: item.orderIndex,
        type: item.type,
        stem: item.stem,
        answerKey: item.answerKey,
        assignedScore: item.assignedScore,
      })),
    };

    const existingExamInstance = await this.prisma.examInstance.findUnique({
      where: {
        examId_studentId: {
          examId: startExamDto.examId,
          studentId,
        },
      },
    });

    const examInstance = existingExamInstance
      ? await this.prisma.examInstance.update({
          where: { id: existingExamInstance.id },
          data: {
            // An instance is the immutable per-student randomization record.
            // Re-opening/retrying an exam may update activity state, never the
            // chosen snapshot, seed, or question order.
            status: 'IN_PROGRESS',
            lastActivityAt: now,
            userAgent: context?.userAgent ?? undefined,
          },
        })
      : await this.prisma.examInstance.create({
          data: {
            examId: startExamDto.examId,
            studentId,
            examSnapshotId: latestSnapshot.id,
            snapshotPayload,
            randomizationSeed,
            questionOrder: mappedSnapshotQuestions.map((item) => item.questionSnapshotId ?? item.questionId),
            status: 'IN_PROGRESS',
            startedAt: now,
            lastActivityAt: now,
            userAgent: context?.userAgent ?? null,
          },
        });

    // Enforce maximum attempts only when the exam is explicitly limited.
    const configuredMaxAttempts =
      exam.maxAttempts ??
      (examSettings?.maxAttempts !== undefined && examSettings?.maxAttempts !== null
        ? Number(examSettings.maxAttempts)
        : null);
    const maxAttempts =
      configuredMaxAttempts === null || configuredMaxAttempts === undefined
        ? null
        : Math.max(1, Math.floor(Number(configuredMaxAttempts)));

    // Get count of completed attempts to determine next attemptNo
    const completedSubmissions = await this.prisma.examSubmission.findMany({
      where: {
        examId: startExamDto.examId,
        studentId,
        status: { in: ['SUBMITTED', 'GRADED', 'FLAGGED'] },
      },
      select: { attemptNo: true },
      orderBy: { attemptNo: 'desc' },
      take: 1,
    });

    const lastAttemptNo = completedSubmissions[0]?.attemptNo || 0;
    const nextAttemptNo = lastAttemptNo + 1;

    if (maxAttempts !== null && nextAttemptNo > maxAttempts) {
      throw new ConflictException(
        `Đã đạt giới hạn số lần làm bài (${lastAttemptNo}/${maxAttempts}).`,
      );
    }

    // Create new submission with idempotency (attemptNo versioning)
    // attach the latest exam snapshot (materialized at publish time) if the table exists
    const startedSubmission = await this.prisma.examSubmission.create({
      data: {
        examId: startExamDto.examId,
        studentId,
        attemptNo: nextAttemptNo,
        status: 'IN_PROGRESS',
        startedAt: now,
        examSnapshotId: latestSnapshot.id,
        examInstanceId: examInstance.id,
      },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            duration: true,
          },
        },
        examInstance: true,
      },
    }).catch((err: any) => {
      // Handle unique constraint violation (race condition: another request created submission for same attemptNo)
      // In this case, return the existing submission as idempotent response
      if (err.code === 'P2002' && err.meta?.target?.includes('unq_exam_student_attempt')) {
        return this.prisma.examSubmission.findFirst({
          where: {
            examId: startExamDto.examId,
            studentId,
            attemptNo: nextAttemptNo,
          },
          include: {
            exam: {
              select: {
                id: true,
                title: true,
                duration: true,
              },
            },
            examInstance: true,
          },
        });
      }
      throw err;
    });

    if (!startedSubmission) {
      throw new ConflictException('Không thể tạo lượt làm bài');
    }

    // Practice/unlimited exams do not create integrity records.
    if (requiresDesktop) {
      try {
        await this.prisma.proctoringSession.create({ data: { submissionId: startedSubmission.id } });
      } catch (e) {
        // Non-fatal: proctoring session failure should not block exam start
      }
    }



    return {
      ...startedSubmission,
      resumed: false,
      deadline: this.resolveSubmissionDeadline({
        startedAt: startedSubmission.startedAt,
        deadlineOverrideAt: startedSubmission.deadlineOverrideAt,
        exam,
      })?.toISOString() ?? null,
      securityState: {
        fullscreenExitCount: 0,
        firstFullscreenWarningUsed: false,
        navigationAttemptCount: 0,
      },
      examInstance: this.sanitizeExamInstanceForStudent(startedSubmission.examInstance),
      proctoringEnabled: requiresDesktop,
      devicePolicy: requiresDesktop ? 'DESKTOP_ONLY' : 'ANY',
    };
  }

  async submitExam(
    submissionId: string,
    submitExamDto: SubmitExamDto,
    studentId: string,
    options?: { idempotencyKey?: string },
  ): Promise<any> {
    const idempotencyKey = options?.idempotencyKey?.trim() || null;
    const now = new Date();

    const submission = await this.prisma.examSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        examId: true,
        studentId: true,
        status: true,
        attemptNo: true,
        version: true,
        submittedAt: true,
        gradedAt: true,
        score: true,
        startedAt: true,
        deadlineOverrideAt: true,
        examInstanceId: true,
        examSnapshotId: true,
        submitIdempotencyKey: true,
        submitLockedAt: true,
        student: {
          select: {
            id: true,
            fullName: true,
            studentId: true,
          },
        },
        exam: {
          select: {
            id: true,
            title: true,
            totalPoints: true,
            settings: true,
            maxAttempts: true,
            timeLimitMinutes: true,
            duration: true,
            endTime: true,
            resultsPublishedAt: true,
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Không tìm thấy lượt làm bài');
    }

    if (submission.studentId !== studentId) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }

    if (submission.status === 'SUBMITTED' || submission.status === 'GRADED') {
      if (idempotencyKey && submission.submitIdempotencyKey === idempotencyKey) {
        return this.buildSubmitResponse(submission, true);
      }
      throw new BadRequestException('Bài thi đã được nộp');
    }

    if (submission.status === 'SUBMITTING') {
      throw new ConflictException('Lượt làm bài đang được xử lý hoàn tất');
    }

    const submitSettings: any = submission.exam.settings || {};
    const submitProctoringEnabled = (submitSettings.proctoringEnabled === undefined
      ? Boolean(submitSettings.requiresProctoring)
      : Boolean(submitSettings.proctoringEnabled)) &&
      (submission.exam.maxAttempts ?? submitSettings.maxAttempts ?? null) !== null &&
      (submission.exam.timeLimitMinutes ?? submitSettings.timeLimitMinutes ?? submission.exam.duration) !== null;
    // Ignore integrity payloads for practice/unlimited attempts rather than creating audit rows.
    const logs = submitProctoringEnabled ? (submitExamDto.logs || []) : [];
    if (logs.length > 1000) {
      throw new BadRequestException('Quá nhiều bản ghi log');
    }

    let totalLogChars = 0;
    for (const l of logs) {
      const detailsStr = l.details ? String(l.details) : '';
      totalLogChars += detailsStr.length;
      if (detailsStr.length > 2000) {
        throw new BadRequestException('Bản ghi log quá lớn');
      }
    }
    if (totalLogChars > 200000) {
      throw new BadRequestException('Dữ liệu log giám sát quá lớn');
    }

    // After the deadline, ignore client-supplied changes and finalize only the
    // server-persisted autosave state. This prevents a direct API call from
    // extending an attempt while still preserving the student's saved work.
    const deadline = this.resolveSubmissionDeadline(submission);
    const autoSubmitted = Boolean(deadline && deadline.getTime() <= now.getTime());
    const answers = autoSubmitted ? [] : (submitExamDto.answers || []).slice(0, 1000);
    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.examSubmission.updateMany({
        where: {
          id: submissionId,
          studentId,
          status: 'IN_PROGRESS',
        },
        data: {
          status: 'SUBMITTING',
          submitLockedAt: now,
          submitIdempotencyKey: idempotencyKey ?? undefined,
          lastActivityAt: now,
          version: { increment: 1 },
        },
      });

      if (locked.count === 0) {
        const current = await tx.examSubmission.findUnique({
          where: { id: submissionId },
          select: {
            id: true,
            status: true,
            attemptNo: true,
            submittedAt: true,
            gradedAt: true,
            score: true,
            version: true,
            submitIdempotencyKey: true,
            studentId: true,
          },
        });

        if (!current) {
          throw new NotFoundException('Không tìm thấy lượt làm bài');
        }

        if (current.studentId !== studentId) {
          throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
        }

        if ((current.status === 'SUBMITTED' || current.status === 'GRADED') && idempotencyKey && current.submitIdempotencyKey === idempotencyKey) {
          return this.buildSubmitResponse({
            ...submission,
            status: current.status,
            submittedAt: current.submittedAt,
            gradedAt: current.gradedAt,
            score: current.score,
            version: current.version,
            submitIdempotencyKey: current.submitIdempotencyKey,
          }, true);
        }

        if (current.status === 'SUBMITTING') {
          throw new ConflictException('Lượt làm bài đang được xử lý hoàn tất');
        }

        throw new BadRequestException('Bài thi đã được nộp');
      }

      const lockedSubmission = await tx.examSubmission.findUnique({
        where: { id: submissionId },
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              studentId: true,
            },
          },
          exam: {
            select: {
              id: true,
              title: true,
              endTime: true,
              timeLimitMinutes: true,
              duration: true,
            },
          },
          examSnapshot: {
            include: {
              questions: {
                include: {
                  questionSnapshot: true,
                },
                orderBy: { orderIndex: 'asc' },
              },
            },
          },
          answers: {
            select: {
              questionId: true,
              sequence: true,
              clientBatchId: true,
              serverVersion: true,
              answer: true,
              timeTaken: true,
            },
          },
        },
      });

      if (!lockedSubmission) {
        throw new NotFoundException('Không tìm thấy lượt làm bài');
      }

      const examQuestions = this.mapSnapshotQuestions(lockedSubmission.examSnapshot?.questions || []);
      if (!lockedSubmission.examSnapshotId || examQuestions.length === 0) {
        throw new ConflictException('Không có bản lưu lượt làm bài hợp lệ. Vui lòng bắt đầu lại bài thi từ bản đã công bố.');
      }

      const validQuestions = new Map<string, SnapshotQuestion>(
        examQuestions.map((eq) => [eq.questionId, eq]),
      );
      const answerMetaByQuestionId = new Map<string, AutosaveAnswerMeta>(
        (lockedSubmission.answers || []).map((answer) => [answer.questionId, answer as AutosaveAnswerMeta]),
      );

      const effectiveAnswers = new Map<string, any>();
      for (const savedAnswer of lockedSubmission.answers || []) {
        if (validQuestions.has(savedAnswer.questionId)) {
          effectiveAnswers.set(savedAnswer.questionId, savedAnswer);
        }
      }
      for (const submittedAnswer of answers) {
        if (validQuestions.has(submittedAnswer.questionId)) {
          effectiveAnswers.set(submittedAnswer.questionId, submittedAnswer);
        }
      }

      const finalAnswerRows = Array.from(effectiveAnswers.values()).map((answerDto: any) => {
        const examQuestion = validQuestions.get(answerDto.questionId)!;
        const answerMeta = answerMetaByQuestionId.get(answerDto.questionId);
        let pointsAwarded = 0;

        const correctAnswer = examQuestion.answerKey ?? null;
        const autoGradable = this.isAutoGradable(examQuestion.type, correctAnswer);
        // Manual questions have no result yet at submission time — leave
        // isCorrect null (same convention as reopenSubmission) instead of a
        // misleading `false`, so the answer matrix/manual-grading views can
        // tell "not graded yet" apart from "graded, awarded zero points".
        let isCorrect: boolean | null = autoGradable ? false : null;

        if (autoGradable) {
          if (correctAnswer && this.compareAnswers(answerDto.answer, correctAnswer, examQuestion.type)) {
            pointsAwarded = examQuestion.assignedScore;
            isCorrect = true;
          }
        }

        return {
          submissionId,
          questionId: answerDto.questionId,
          questionVersionId: examQuestion.questionVersionId,
          questionSnapshotId: examQuestion.questionSnapshotId,
          sequence: Number(answerMeta?.sequence || 1),
          clientBatchId: answerMeta?.clientBatchId || null,
          serverVersion: Number(answerMeta?.serverVersion || 0),
          answer: answerDto.answer,
          timeTaken: answerDto.timeTaken,
          isCorrect,
          // A zero point is a legitimate manual score. Leave it null until an
          // instructor explicitly grades the response.
          pointsAwarded: autoGradable ? pointsAwarded : null,
        };
      });

      const totalScore = finalAnswerRows.reduce((sum, row) => sum + Number(row.pointsAwarded || 0), 0);
      const maxRawScore = examQuestions.reduce(
        (sum, eq) => sum + Number(eq.assignedScore || 0),
        0,
      );
      const normalizedScore = this.normalizeScore(totalScore, maxRawScore);
      const hasManualGrading = examQuestions.some(
        (eq) => !this.isAutoGradable(eq.type, eq.answerKey),
      );

      // "Hiển thị kết quả ngay" (settings.showResultImmediately) promises the
      // student their score right after submitting. That is only honest for
      // fully auto-graded submissions — anything with essay/manual questions
      // still needs the instructor's explicit publish action once grading is
      // done (see publishExamResults).
      if (
        !hasManualGrading &&
        submitSettings.showResultImmediately === true &&
        !submission.exam.resultsPublishedAt
      ) {
        await tx.exam.updateMany({
          where: { id: submission.examId, resultsPublishedAt: null },
          data: { resultsPublishedAt: now },
        });
      }

      await tx.submissionAnswer.deleteMany({
        where: { submissionId },
      });

      if (finalAnswerRows.length > 0) {
        await tx.submissionAnswer.createMany({
          data: finalAnswerRows,
        });
      }

      const answeredByVersionId = new Map<string, { correct: number; incorrect: number; skipped: number }>();
      const finalAnswerByQuestionId = new Map(finalAnswerRows.map((row) => [row.questionId, row]));

      for (const examQuestion of examQuestions) {
        const versionId =
          examQuestion.questionVersionId ||
          null;
        if (!versionId) continue;

        const answerRow = finalAnswerByQuestionId.get(examQuestion.questionId);
        const bucket = answeredByVersionId.get(versionId) || { correct: 0, incorrect: 0, skipped: 0 };

        if (!answerRow) {
          bucket.skipped += 1;
        } else if (this.isAutoGradable(examQuestion.type, examQuestion.answerKey)) {
          if (answerRow.isCorrect) {
            bucket.correct += 1;
          } else {
            bucket.incorrect += 1;
          }
        }
        // Manual questions (ESSAY/FILL_IN_BLANK/...) have no result yet at
        // submission time — do not count them as "incorrect" here. Their
        // correct/incorrect tally is recorded once in gradeAnswer(), when an
        // instructor actually grades the response.

        answeredByVersionId.set(versionId, bucket);
      }

      for (const examQuestion of examQuestions) {
        const versionId =
          examQuestion.questionVersionId ||
          null;
        if (!versionId) continue;

        const bucket = answeredByVersionId.get(versionId) || { correct: 0, incorrect: 0, skipped: 1 };
        const versionTotal = bucket.correct + bucket.incorrect + bucket.skipped;
        const pValue = versionTotal > 0 ? bucket.correct / versionTotal : 0;
        const difficultyIndex = versionTotal > 0 ? 1 - pValue : 0;
        const discriminationIndex =
          versionTotal > 0
            ? Math.max(-1, Math.min(1, (bucket.correct - bucket.incorrect) / versionTotal))
            : null;

        await tx.questionStatistics.upsert({
          where: { questionVersionId: versionId },
          create: {
            questionVersionId: versionId,
            questionId: examQuestion.questionId,
            totalAttempts: versionTotal,
            correctAttempts: bucket.correct,
            incorrectAttempts: bucket.incorrect,
            skippedAttempts: bucket.skipped,
            pValue,
            difficultyIndex,
            discriminationIndex,
            lastRecomputedAt: now,
          },
          update: {
            totalAttempts: { increment: versionTotal },
            correctAttempts: { increment: bucket.correct },
            incorrectAttempts: { increment: bucket.incorrect },
            skippedAttempts: { increment: bucket.skipped },
            pValue,
            difficultyIndex,
            discriminationIndex,
            lastRecomputedAt: now,
          },
        });
      }

      if (logs.length > 0) {
        const tabSwitchCount = logs.filter((x) => String(x.type).toLowerCase() === 'tab_switch').length;
        // Same fix as addLogs() above: the client only ever emits 'mouse_idle'.
        const mouseAnomalies = logs.filter((x) => ['mouse_anomaly', 'mouse_idle'].includes(String(x.type).toLowerCase())).length;

        const proctoringSession = await tx.proctoringSession.upsert({
          where: { submissionId },
          create: {
            submissionId,
            tabSwitchCount,
            mouseAnomalies,
          },
          update: {
            tabSwitchCount: { increment: tabSwitchCount },
            mouseAnomalies: { increment: mouseAnomalies },
          },
        });

        const integrityRows = logs.map((log) => ({
          proctoringId: proctoringSession.id,
          eventType: String(log.type).slice(0, 100),
          details: log.details ? String(log.details).slice(0, 2000) : undefined,
          timestamp: log.ts ? new Date(log.ts) : now,
        }));

        if (integrityRows.length > 0) {
          await tx.integrityLog.createMany({ data: integrityRows });
        }
      }

      const updatedSubmission = await tx.examSubmission.update({
        where: { id: submissionId },
        data: {
          status: hasManualGrading ? 'SUBMITTED' : 'GRADED',
          submittedAt: now,
          gradedAt: hasManualGrading ? null : now,
          score: normalizedScore,
          autoSubmittedAt: autoSubmitted ? now : null,
          finalSnapshotVersion: lockedSubmission.version,
          lastActivityAt: now,
          version: { increment: 1 },
        },
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              studentId: true,
            },
          },
          exam: {
            select: {
              id: true,
              title: true,
              totalPoints: true,
              endTime: true,
              timeLimitMinutes: true,
              duration: true,
            },
          },
          answers: {
            include: {
              question: {
                select: {
                  id: true,
                  type: true,
                  content: true,
                },
              },
            },
          },
        },
      });

      if (submission.examInstanceId) {
        await tx.examInstance.update({
          where: { id: submission.examInstanceId },
          data: {
            status: hasManualGrading ? 'SUBMITTED' : 'GRADED',
            submittedAt: now,
            rawScore: totalScore,
            maxRawScore,
            normalizedScore,
            lastActivityAt: now,
          },
        });
      }

      return {
        submission: updatedSubmission,
        totalScore,
        maxRawScore,
        normalizedScore,
        hasManualGrading,
      };
    });

    if (logs.length > 0) {
      this.publishRealtimeLogs(
        submission.examId,
        submission.id,
        {
          id: submission.student?.id,
          fullName: submission.student?.fullName,
          studentId: submission.student?.studentId,
        },
        logs,
        submission.attemptNo,
      );
    }
    return {
      ...this.buildSubmitResponse(result.submission, false),
      rawScore: result.totalScore,
      normalizedScore: result.normalizedScore,
      maxRawScore: result.maxRawScore,
      autoSubmitted,
    };
  }

  async autosaveAnswers(
    submissionId: string,
    payload: AutosaveExamDto,
    studentId: string,
  ): Promise<{
    success: boolean;
    count: number;
    skipped: number;
    serverVersion: number;
    reviewFeedback?: DuringReviewFeedback[];
  }> {
    const answers = Array.isArray(payload?.answers) ? payload.answers : [];
    const clientBatchId = String(payload?.clientBatchId || '').trim() || null;

    const submission = await this.prisma.examSubmission.findUnique({
      where: { id: submissionId },
          select: {
            id: true,
            studentId: true,
            score: true,
            status: true,
            version: true,
            examSnapshotId: true,
            startedAt: true,
            deadlineOverrideAt: true,
            exam: {
              select: {
                id: true,
                endTime: true,
                timeLimitMinutes: true,
                duration: true,
                reviewSettings: true,
                settings: true,
              },
            },
            examSnapshot: {
              select: {
                questions: {
                  select: {
                    questionId: true,
                    questionVersionId: true,
                  questionSnapshotId: true,
                  payload: true,
                  questionSnapshot: { select: { id: true, payload: true } },
                  },
                },
              },
            },
      },
    });

    if (!submission) {
      throw new NotFoundException('Không tìm thấy lượt làm bài');
    }

    if (submission.studentId !== studentId) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }

    if (submission.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Bài thi đã được nộp, không thể tự động lưu');
    }

    const deadline = this.resolveSubmissionDeadline(submission);
    if (deadline && deadline.getTime() <= Date.now()) {
      throw new ConflictException('Đã hết thời gian làm bài; không thể thay đổi câu trả lời');
    }

    const snapshotQuestions = submission.examSnapshot?.questions || [];
    if (!submission.examSnapshotId || snapshotQuestions.length === 0) {
      throw new ConflictException('Không có bản lưu lượt làm bài');
    }

    const examQuestions = this.mapSnapshotQuestions(snapshotQuestions);
    const questionById = new Map(examQuestions.map((question) => [question.questionId, question]));
    const validQuestionIds = new Set(questionById.keys());
    const versionByQuestionId = new Map(
      snapshotQuestions.map((eq) => [eq.questionId, eq.questionVersionId || null]),
    );
    const questionSnapshotByQuestionId = new Map(
      snapshotQuestions.map((eq) => [eq.questionId, eq.questionSnapshotId || null]),
    );
    const normalizedAnswers = new Map<string, { questionId: string; sequence: number; answer: any; timeTaken?: number }>();

    for (const answer of answers.slice(0, 500)) {
      if (!answer || !validQuestionIds.has(answer.questionId)) continue;

      const sequence = Number(answer.sequence || 0);
      if (!Number.isInteger(sequence) || sequence < 1) continue;

      const current = normalizedAnswers.get(answer.questionId);
      if (!current || sequence > current.sequence) {
        normalizedAnswers.set(answer.questionId, {
          questionId: answer.questionId,
          sequence,
          answer: answer.answer,
          timeTaken: answer.timeTaken,
        });
      }
    }

    if (normalizedAnswers.size === 0) {
      return { success: true, count: 0, skipped: answers.length, serverVersion: submission.version || 0 };
    }

    // Backpressure: if queue backlog is high, decline low-priority autosave to protect DB
    try {
      const overloaded = await this.queueService.isQueueOverloaded('integrity-logs', Number(process.env.QUEUE_WAITING_THRESHOLD_AUTOSAVE || '1000'));
      if (overloaded) {
        // signal client to retry later; do not perform DB writes for autosave under severe load
        return { success: false, count: 0, skipped: answers.length, serverVersion: submission.version || 0 };
      }
    } catch (err) {
      // ignore and continue
    }

    const incomingQuestionIds = Array.from(normalizedAnswers.keys());

    if (incomingQuestionIds.length === 0) {
      return { success: true, count: 0, skipped: answers.length, serverVersion: submission.version || 0 };
    }

    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.examSubmission.updateMany({
        where: {
          id: submissionId,
          studentId,
          status: 'IN_PROGRESS',
        },
        data: {
          lastActivityAt: now,
        },
      });

      if (locked.count === 0) {
        throw new BadRequestException('Bài thi đã được nộp, không thể tự động lưu');
      }

      const currentSubmission = await tx.examSubmission.findUnique({
        where: { id: submissionId },
        select: { version: true, status: true },
      });

      if (!currentSubmission || currentSubmission.status !== 'IN_PROGRESS') {
        throw new BadRequestException('Bài thi đã được nộp, không thể tự động lưu');
      }

      const existingAnswers = await tx.submissionAnswer.findMany({
        where: {
          submissionId,
          questionId: { in: incomingQuestionIds },
        },
        select: {
          id: true,
          questionId: true,
          sequence: true,
        },
      });

      const existingByQuestionId = new Map<string, ExistingAutosaveAnswer>(
        existingAnswers.map((row) => [row.questionId, row]),
      );
      const changedAnswers = Array.from(normalizedAnswers.values()).filter((answer) => {
        const existing = existingByQuestionId.get(answer.questionId);
        return !existing || answer.sequence > existing.sequence;
      });

      if (changedAnswers.length === 0) {
        return {
          success: true,
          count: 0,
          skipped: normalizedAnswers.size,
          serverVersion: Number(currentSubmission.version || 0),
        };
      }

      const serverVersion = Number(currentSubmission.version || 0) + 1;
      let savedCount = 0;

      for (const answer of changedAnswers) {
        const existing = existingByQuestionId.get(answer.questionId);
        const data = {
          answer: answer.answer,
          timeTaken: answer.timeTaken,
          sequence: answer.sequence,
          clientBatchId,
          serverVersion,
        };

        if (existing) {
          await tx.submissionAnswer.update({
            where: { id: existing.id },
            data,
          });
        } else {
          const qSnapshotId = questionSnapshotByQuestionId.get(answer.questionId) || null;
          await tx.submissionAnswer.create({
            data: {
              submissionId,
              questionId: answer.questionId,
              questionVersionId: versionByQuestionId.get(answer.questionId) || null,
              questionSnapshotId: qSnapshotId,
              answer: answer.answer,
              timeTaken: answer.timeTaken,
              sequence: answer.sequence,
              clientBatchId,
              serverVersion,
            },
          });
        }

        savedCount += 1;
      }

      await tx.examSubmission.update({
        where: { id: submissionId },
        data: {
          version: { increment: 1 },
          lastAutosaveAt: now,
          lastActivityAt: now,
        },
      });

      return {
        success: true,
        count: savedCount,
        skipped: normalizedAnswers.size - savedCount,
        serverVersion,
        // Internal only: review feedback must be based on the answers that were
        // actually persisted, never a stale answer from the same batch.
        savedQuestionIds: changedAnswers.map((answer) => answer.questionId),
      };
    });

    const reviewSettings = submission.exam.reviewSettings ?? (submission.exam.settings as any)?.reviewSettings;
    const { savedQuestionIds = [], ...autosaveResult } = result;
    const savedQuestionIdSet = new Set(savedQuestionIds);
    const reviewFeedback = Array.from(normalizedAnswers.values())
      .filter((answer) => savedQuestionIdSet.has(answer.questionId))
      .map((answer) => {
        const question = questionById.get(answer.questionId);
        return question
          ? this.buildDuringReviewFeedback(question, answer.answer, reviewSettings)
          : null;
      })
      .filter((feedback): feedback is DuringReviewFeedback => Boolean(feedback));

    return reviewFeedback.length > 0
      ? { ...autosaveResult, reviewFeedback }
      : autosaveResult;
  }

  private async getStudentSecurityState(submissionId: string) {
    const [proctoringSession, fullscreenExitCount, firstFullscreenWarningCount, navigationAttemptCount] = await Promise.all([
      this.prisma.proctoringSession.findUnique({
        where: { submissionId },
        select: { tabSwitchCount: true },
      }),
      this.prisma.integrityLog.count({
        where: { eventType: 'fullscreen_exit', proctoring: { submissionId } },
      }),
      this.prisma.integrityLog.count({
        where: { eventType: 'fullscreen_exit_warning', proctoring: { submissionId } },
      }),
      this.prisma.integrityLog.count({
        where: { eventType: 'navigation_attempt', proctoring: { submissionId } },
      }),
    ]);

    return {
      fullscreenExitCount,
      tabSwitchCount: Number(proctoringSession?.tabSwitchCount || 0),
      firstFullscreenWarningUsed: firstFullscreenWarningCount > 0,
      navigationAttemptCount,
    };
  }

  async addLogs(
    submissionId: string,
    logs: Array<{ type: string; details?: any; ts?: number; clientEventId?: string }>,
    studentId: string
  ): Promise<any> {
    const submission = await this.prisma.examSubmission.findUnique({
      where: { id: submissionId },
      include: {
        exam: { select: { settings: true, maxAttempts: true, timeLimitMinutes: true, duration: true } },
        student: {
          select: {
            id: true,
            fullName: true,
            studentId: true,
          },
        },
      },
    });
    if (!submission) {
      throw new NotFoundException('Không tìm thấy lượt làm bài');
    }

    if (submission.studentId !== studentId) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    }

    const integritySettings: any = submission.exam.settings || {};
    const integrityEnabled = (integritySettings.proctoringEnabled === undefined
      ? Boolean(integritySettings.requiresProctoring)
      : Boolean(integritySettings.proctoringEnabled)) &&
      (submission.exam.maxAttempts ?? integritySettings.maxAttempts ?? null) !== null &&
      (submission.exam.timeLimitMinutes ?? integritySettings.timeLimitMinutes ?? submission.exam.duration ?? null) !== null;

    // Network connectivity events are session-continuity signals, not
    // proctoring evidence — they carry no screenshot/webcam payload, so they
    // must still be recorded (and counted) even on exams without full
    // proctoring configured, unlike tab_switch/camera/etc which need it.
    const entriesIn = logs || [];
    const entries = integrityEnabled
      ? entriesIn
      : entriesIn.filter((l) => ALWAYS_RECORDED_EVENT_TYPES.has(String(l.type).toLowerCase()));
    if (!integrityEnabled && entries.length === 0) return;

    // Validate logs payload (reuse same limits as submitExam)
    if (entries.length > 1000) {
      throw new BadRequestException('Quá nhiều bản ghi log');
    }
    let totalLogChars = 0;
    for (const l of entries) {
      const detailsStr = l.details ? String(l.details) : '';
      totalLogChars += detailsStr.length;
      if (detailsStr.length > 2000) {
        throw new BadRequestException('Bản ghi log quá lớn');
      }
    }
    if (totalLogChars > 200000) {
      throw new BadRequestException('Dữ liệu log giám sát quá lớn');
    }

    // Persist proctoring aggregates and integrity logs
    const result = await this.prisma.$transaction(async (tx) => {
      const now = new Date();

      const proctoringSession = await tx.proctoringSession.upsert({
        where: { submissionId },
        create: {
          submissionId,
          tabSwitchCount: 0,
          mouseAnomalies: 0,
        },
        update: {},
      });

      const proctoringId = proctoringSession.id;
      const acceptedEntries: typeof entries = [];
      for (const entry of entries) {
        const clientEventId = String(entry.clientEventId || '').trim().slice(0, 80) || null;
        try {
          await tx.integrityLog.create({
            data: {
              proctoringId,
              clientEventId: clientEventId ?? undefined,
              eventType: String(entry.type).slice(0, 100),
              details: entry.details ? String(entry.details).slice(0, 2000) : undefined,
              timestamp: entry.ts ? new Date(entry.ts) : new Date(),
            },
          });
          acceptedEntries.push(entry);
        } catch (error: any) {
          // Navigation/unload retries reuse the same clientEventId. A duplicate
          // means the original evidence is already durable, never a second event.
          if (clientEventId && error?.code === 'P2002') continue;
          throw error;
        }
      }

      const tabSwitchCount = acceptedEntries.filter((x) => String(x.type).toLowerCase() === 'tab_switch').length;
      // The client only ever emits 'mouse_idle' (see ExamTaking.tsx's mouse
      // idle detector) — it never emits 'mouse_anomaly'. Counting only the
      // latter meant this aggregate was permanently stuck at 0, silently
      // disabling mouse-anomaly monitoring end-to-end (no counter increment,
      // so the overview's synthetic mouse-anomaly alert never fired either).
      const mouseAnomalies = acceptedEntries.filter((x) => ['mouse_anomaly', 'mouse_idle'].includes(String(x.type).toLowerCase())).length;
      if (tabSwitchCount || mouseAnomalies) {
        await tx.proctoringSession.update({
          where: { id: proctoringId },
          data: {
            tabSwitchCount: { increment: tabSwitchCount },
            mouseAnomalies: { increment: mouseAnomalies },
          },
        });
      }

      if (submission.examInstanceId && acceptedEntries.length > 0) {
        await tx.examInstance.update({
          where: { id: submission.examInstanceId },
          data: { lastActivityAt: now },
        });

        const tabEvents = acceptedEntries
          .filter((l) => String(l.type).toLowerCase() === 'tab_switch')
          .map((l) => ({
            examInstanceId: submission.examInstanceId!,
            occurredAt: l.ts ? new Date(l.ts) : now,
            fromTab: 'exam',
            toTab: 'hidden',
          }));
        if (tabEvents.length > 0) {
          await tx.tabSwitchEvent.createMany({ data: tabEvents });
        }

        const focusEvents = acceptedEntries
          .filter((l) => ['blur', 'window_blur', 'fullscreen_exit'].includes(String(l.type).toLowerCase()))
          .map((l) => ({
            examInstanceId: submission.examInstanceId!,
            occurredAt: l.ts ? new Date(l.ts) : now,
            focusState: 'BLURRED' as const,
            reason: String(l.details || l.type).slice(0, 255),
          }));
        if (focusEvents.length > 0) {
          await tx.focusEvent.createMany({ data: focusEvents });
        }

        const interactionEvents = acceptedEntries.map((l) => ({
          examInstanceId: submission.examInstanceId!,
          eventType: String(l.type).slice(0, 100),
          payload: {
            details: l.details ?? null,
            clientTimestamp: l.ts ?? null,
          },
          createdAt: l.ts ? new Date(l.ts) : now,
        }));
        await tx.interactionLog.createMany({ data: interactionEvents });
      }

      const [securitySession, fullscreenExitCount, firstFullscreenWarningCount, navigationAttemptCount] = await Promise.all([
        tx.proctoringSession.findUnique({
          where: { id: proctoringId },
          select: { tabSwitchCount: true },
        }),
        tx.integrityLog.count({ where: { proctoringId, eventType: 'fullscreen_exit' } }),
        tx.integrityLog.count({ where: { proctoringId, eventType: 'fullscreen_exit_warning' } }),
        tx.integrityLog.count({ where: { proctoringId, eventType: 'navigation_attempt' } }),
      ]);

      return {
        success: true,
        acceptedCount: acceptedEntries.length,
        acceptedEntries,
        securityState: {
          fullscreenExitCount,
          tabSwitchCount: Number(securitySession?.tabSwitchCount || 0),
          firstFullscreenWarningUsed: firstFullscreenWarningCount > 0,
          navigationAttemptCount,
        },
      };
    });

    // Publish realtime logs
    if (result.acceptedEntries.length > 0) {
      this.publishRealtimeLogs(
        submission.examId,
        submission.id,
        {
          id: submission.student?.id,
          fullName: submission.student?.fullName,
          studentId: submission.student?.studentId,
        },
        result.acceptedEntries,
      );
    }

    return {
      success: result.success,
      acceptedCount: result.acceptedCount,
      securityState: result.securityState,
    };
  }


  // Whether a question of this type/correctAnswer shape can be graded
  // objectively. MATCHING/ORDERING are only auto-gradable when their
  // correctAnswer actually has the expected pairs/items array — older
  // questions saved before that format existed fall back to manual grading
  // instead of being silently (and incorrectly) marked wrong.
  private isAutoGradable(type: string, correctAnswer: any): boolean {
    if (AUTO_GRADED_TYPES.has(type)) return true;
    if (type === 'MATCHING') {
      return Array.isArray(correctAnswer?.pairs) && correctAnswer.pairs.length > 0;
    }
    if (type === 'ORDERING') {
      return Array.isArray(correctAnswer?.items) && correctAnswer.items.length > 0;
    }
    return false;
  }

  private normalizeAnswerText(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private compareMatchingAnswer(submitted: any, pairs: Array<{ left?: string; right?: string }>): boolean {
    if (!submitted || typeof submitted !== 'object') return false;
    return pairs.every((pair, index) => {
      const chosen = submitted[String(index)] ?? submitted[index];
      return this.normalizeAnswerText(chosen) === this.normalizeAnswerText(pair?.right);
    });
  }

  private compareOrderingAnswer(submitted: any, items: unknown[]): boolean {
    if (!Array.isArray(submitted) || submitted.length !== items.length) return false;
    return submitted.every((value, index) => this.normalizeAnswerText(value) === this.normalizeAnswerText(items[index]));
  }

  private findErrorLineSet(value: any): Set<string> {
    const raw = Array.isArray(value)
      ? value
      : Array.isArray(value?.answers)
        ? value.answers
        : String(value?.answer ?? value ?? '').split(',');
    return new Set(raw.map((item: unknown) => String(item).trim().toUpperCase()).filter(Boolean));
  }

  private compareFindErrorAnswer(submitted: any, correct: any): boolean {
    const submittedLines = this.findErrorLineSet(submitted);
    const correctLines = this.findErrorLineSet(correct);
    return submittedLines.size === correctLines.size && [...correctLines].every((line) => submittedLines.has(line));
  }

  private normalizeTrueFalseAnswer(value: any): boolean | null {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value.answer : value;
    if (typeof raw === 'boolean') return raw;
    const normalized = String(raw ?? '').trim().toLowerCase();
    if (normalized === 'true' || normalized === 'a') return true;
    if (normalized === 'false' || normalized === 'b') return false;
    return null;
  }

  private compareAnswers(submitted: any, correct: any, type?: string): boolean {
    if (type === 'TRUE_FALSE') {
      const submittedBool = this.normalizeTrueFalseAnswer(submitted);
      const correctBool = this.normalizeTrueFalseAnswer(correct);
      return submittedBool !== null && submittedBool === correctBool;
    }
    if (type === 'FIND_ERROR') {
      return this.compareFindErrorAnswer(submitted, correct);
    }
    if (type === 'MATCHING' && Array.isArray(correct?.pairs)) {
      return this.compareMatchingAnswer(submitted, correct.pairs);
    }
    if (type === 'ORDERING' && Array.isArray(correct?.items)) {
      return this.compareOrderingAnswer(submitted, correct.items);
    }
    if (typeof submitted === 'object' && typeof correct === 'object') {
      return JSON.stringify(submitted) === JSON.stringify(correct);
    }
    return submitted === correct;
  }

  async getIntegrityCases(query: IntegrityCasesQuery = {}, user?: RequestUser) {
    const page = Math.max(1, Number(query.page || 1) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit || 10) || 10));
    const search = String(query.search || '').trim().toLowerCase();
    const confidenceFilter = String(query.confidence || 'all').trim();
    const examTitleFilter = String(query.examTitle || '').trim().toLowerCase();
    const examIdFilter = String(query.examId || '').trim();
    const courseIdFilter = String(query.courseId || '').trim();
    const termFilter = String(query.term || '').trim().toUpperCase();
    const academicYearFilter = String(query.academicYear || '').trim();
    const statusFilter = String(query.status || 'all').trim().toLowerCase();
    const submissionIdFilter = String(query.submissionId || '').trim();
    const timeAnomalyFilter =
      typeof query.timeAnomaly === 'boolean'
        ? query.timeAnomaly
        : typeof query.timeAnomaly === 'string' && query.timeAnomaly.trim()
          ? query.timeAnomaly.toLowerCase() === 'true'
          : undefined;
    const submittedFrom = query.submittedFrom ? new Date(String(query.submittedFrom)) : null;
    const submittedTo = query.submittedTo ? new Date(String(query.submittedTo)) : null;
    if (submittedTo && !Number.isNaN(submittedTo.getTime())) {
      submittedTo.setHours(23, 59, 59, 999);
    }

    const lecturerScope = String(user?.role || '').toUpperCase() === 'LECTURER'
      ? { submission: { exam: { OR: [{ creatorId: user!.id }, { course: { lecturerId: user!.id } }] } } }
      : {};
    const sessions = await this.prisma.proctoringSession.findMany({
      where: {
        ...lecturerScope,
        OR: [
          { tabSwitchCount: { gt: 0 } },
          { mouseAnomalies: { gt: 0 } },
          { logs: { some: {} } },
        ],
      },
      include: {
        logs: {
          orderBy: { timestamp: 'desc' },
          take: 50,
        },
        submission: {
          select: {
            id: true,
            attemptNo: true,
            studentId: true,
            score: true,
            submittedAt: true,
            startedAt: true,
            createdAt: true,
            student: {
              select: {
                id: true,
                fullName: true,
                studentId: true,
                email: true,
              },
            },
            exam: {
              select: {
                id: true,
                title: true,
                course: {
                  select: {
                    id: true,
                    term: true,
                    academicYear: true,
                  },
                },
              },
            },
            integrityReview: {
              select: {
                status: true,
                reviewerId: true,
                reviewerNote: true,
                decidedAt: true,
                penaltyMode: true,
                penaltyPercent: true,
                penaltyAmount: true,
                academicScore: true,
                deductedScore: true,
                finalScore: true,
                auditLogs: {
                  orderBy: { createdAt: 'desc' },
                  take: 20,
                  select: {
                    action: true,
                    previousPercent: true,
                    nextPercent: true,
                    deductedScore: true,
                    note: true,
                    createdAt: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const allCases: IntegrityCase[] = sessions.map((session: any) => {
      const tabSwitchCount = Number(session.tabSwitchCount || 0);
      const mouseAnomalies = Number(session.mouseAnomalies || 0);
      const logs = Array.isArray(session.logs) ? session.logs : [];
      const weightedLogScore = logs.reduce(
        (sum: number, log: any) => sum + this.getIntegrityLogWeight(log.eventType),
        0,
      );
      const riskScore = Math.min(
        100,
        tabSwitchCount * 10 + mouseAnomalies * 8 + weightedLogScore,
      );
      const confidence = this.getIntegrityConfidence(tabSwitchCount, mouseAnomalies, riskScore);
      const reasonMap = new Map<string, number>();
      for (const log of logs) {
        const event = String(log.eventType || '').toLowerCase();
        reasonMap.set(event, (reasonMap.get(event) || 0) + 1);
      }

      const reasons: IntegrityCase['reasons'] = [];
      if (tabSwitchCount > 0) {
        reasons.push({
          type: 'behavior',
          description: 'Phát hiện hành vi chuyển tab',
          weight: Math.min(1, tabSwitchCount / 10),
          evidence: `Đã ghi nhận ${tabSwitchCount} lần chuyển tab`,
        });
      }
      if (mouseAnomalies > 0) {
        reasons.push({
          type: 'behavior',
          description: 'Phát hiện chuyển động chuột bất thường',
          weight: Math.min(1, mouseAnomalies / 10),
          evidence: `Đã ghi nhận ${mouseAnomalies} lần chuyển động chuột bất thường`,
        });
      }
      for (const [event, count] of reasonMap.entries()) {
        const reason = this.buildIntegrityLogReason(event, count);
        if (reason) reasons.push(reason);
      }

      const hasTimingAnomaly = logs.some((log: any) =>
        this.isTimingAnomalyLog(log.eventType, log.details),
      );
      const submittedAt =
        session.submission?.submittedAt ||
        session.submission?.startedAt ||
        session.submission?.createdAt ||
        session.createdAt;
      const studentCode =
        session.submission?.student?.studentId ||
        session.submission?.student?.id ||
        session.submission?.studentId;

      return {
        id: `integrity-${session.submission?.id || session.id}`,
        submissionId: session.submission?.id || '',
        attemptNo: session.submission?.attemptNo ?? null,
        studentId: studentCode || 'N/A',
        studentName: session.submission?.student?.fullName || session.submission?.student?.email || 'Unknown student',
        examId: session.submission?.exam?.id || '',
        examTitle: session.submission?.exam?.title || 'Unknown exam',
        courseId: session.submission?.exam?.course?.id || null,
        academicYear: session.submission?.exam?.course?.academicYear || null,
        term: session.submission?.exam?.course?.term || null,
        submittedAt: submittedAt ? new Date(submittedAt).toISOString() : new Date().toISOString(),
        confidence,
        status: String(session.submission?.integrityReview?.status || 'PENDING').toLowerCase() as IntegrityCaseStatus,
        academicScore: this.toNumber(session.submission?.score, 0),
        integrityReview: session.submission?.integrityReview
          ? {
              status: String(session.submission.integrityReview.status).toLowerCase() as IntegrityCaseStatus,
              reviewerNote: session.submission.integrityReview.reviewerNote,
              decidedAt: session.submission.integrityReview.decidedAt,
              penaltyMode: session.submission.integrityReview.penaltyMode,
              penaltyPercent: session.submission.integrityReview.penaltyPercent,
              penaltyAmount: session.submission.integrityReview.penaltyAmount,
              academicScore: this.toNumber(session.submission.integrityReview.academicScore, 0),
              deductedScore: this.toNumber(session.submission.integrityReview.deductedScore, 0),
              finalScore: this.toNumber(session.submission.integrityReview.finalScore, 0),
              auditLogs: session.submission.integrityReview.auditLogs,
            }
          : null,
        reasons: reasons.length
          ? reasons
          : [{
              type: 'behavior',
              description: 'Đã ghi nhận sự kiện liên quan đến toàn vẹn học thuật',
              weight: Math.min(1, riskScore / 100),
              evidence: `Đã ghi nhận ${logs.length} sự kiện`,
            }],
        timeAnomaly: hasTimingAnomaly,
        // Real eventType-derived categories (not the previous always-empty
        // placeholder) — used below to compute the `patterns` stat
        // breakdown without re-parsing already-translated Vietnamese text.
        patternMatch: (() => {
          const categories = new Set<string>();
          if (tabSwitchCount > 0) categories.add('tab_switch');
          if (mouseAnomalies > 0) categories.add('mouse');
          for (const event of reasonMap.keys()) {
            if (['tab_switch', 'mouse_idle', 'mouse_anomaly'].includes(event)) continue;
            categories.add(getIntegrityEventCategory(event));
          }
          return [...categories];
        })(),
      };
    });

    const filteredCases = allCases.filter((item) => {
      if (submissionIdFilter && item.submissionId !== submissionIdFilter) return false;
      if (statusFilter && statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (confidenceFilter && confidenceFilter !== 'all' && item.confidence !== confidenceFilter) return false;
      if (examTitleFilter && !item.examTitle.toLowerCase().includes(examTitleFilter)) return false;
      if (examIdFilter && item.examId !== examIdFilter) return false;
      if (courseIdFilter && item.courseId !== courseIdFilter) return false;
      if (academicYearFilter && item.academicYear !== academicYearFilter) return false;
      if (termFilter && item.term !== termFilter) return false;
      if (typeof timeAnomalyFilter === 'boolean' && Boolean(item.timeAnomaly) !== timeAnomalyFilter) return false;

      const submittedAt = new Date(item.submittedAt).getTime();
      if (submittedFrom && !Number.isNaN(submittedFrom.getTime()) && submittedAt < submittedFrom.getTime()) return false;
      if (submittedTo && !Number.isNaN(submittedTo.getTime()) && submittedAt > submittedTo.getTime()) return false;

      if (search) {
        const haystack = [
          item.studentName,
          item.studentId,
          item.examTitle,
          item.examId,
        ].join(' ').toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      return true;
    });

    // Sort by the same `submittedAt` timestamp the list displays — sessions
    // were fetched ordered by ProctoringSession.createdAt, which can diverge
    // from submittedAt (e.g. a session created early but submitted late),
    // making the on-screen order look unrelated to the visible time column.
    filteredCases.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    const patterns = {
      tabSwitch: 0,
      mouseAnomaly: 0,
      copyPaste: 0,
      otherBehavior: 0,
    };

    // Categorized from the real eventType (via patternMatch, computed
    // above) rather than substring-matching the Vietnamese description
    // text — the old approach silently miscounted every mouse-related
    // reason as "otherBehavior" once its label stopped containing the
    // English word "mouse".
    for (const item of filteredCases) {
      for (const category of item.patternMatch || []) {
        if (category === 'tab_switch') patterns.tabSwitch += 1;
        else if (category === 'mouse') patterns.mouseAnomaly += 1;
        else if (category === 'copy_paste') patterns.copyPaste += 1;
        else patterns.otherBehavior += 1;
      }
    }

    const timelineMap = new Map<string, { date: string; count: number; highConfidence: number }>();
    for (const item of filteredCases) {
      const d = item.submittedAt ? item.submittedAt.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const entry = timelineMap.get(d) || { date: d, count: 0, highConfidence: 0 };
      entry.count += 1;
      if (item.confidence === 'High') entry.highConfidence += 1;
      timelineMap.set(d, entry);
    }
    const timeline = Array.from(timelineMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    const total = filteredCases.length;
    const start = (page - 1) * limit;

    return {
      data: filteredCases.slice(start, start + limit),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      stats: {
        totalFlagged: total,
        pendingReview: filteredCases.filter((item) => item.status === 'pending').length,
        highConfidence: filteredCases.filter((item) => item.confidence === 'High').length,
        confirmedCases: filteredCases.filter((item) => item.status === 'confirmed').length,
      },
      patterns,
      timeline,
    };
  }

  async reviewIntegrityCase(
    submissionId: string,
    dto: { status: 'REVIEWED' | 'DISMISSED' | 'CONFIRMED'; notes?: string; deductionPercent?: 10 | 25 | 50 | 100; applyPenalty?: boolean; penaltyMode?: 'PERCENT' | 'FIXED'; penaltyAmount?: number },
    user: RequestUser,
  ) {
    const submission = await this.prisma.examSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, examId: true, score: true },
    });
    if (!submission) throw new NotFoundException('Không tìm thấy lượt làm bài');
    await this.accessPolicy.assertInstructorCanAccessExam(submission.examId, user);

    const note = dto.notes?.trim() || '';
    const requestedPenaltyMode = dto.penaltyMode === 'FIXED' ? 'FIXED' : 'PERCENT';
    const requestedPenaltyAmount = Number(dto.penaltyAmount);
    if (dto.status === 'CONFIRMED') {
      if (dto.applyPenalty && requestedPenaltyMode === 'PERCENT' && (!dto.deductionPercent || ![10, 25, 50, 100].includes(dto.deductionPercent))) {
        throw new BadRequestException('Cần nhập tỷ lệ trừ điểm vi phạm hợp lệ');
      }
      if (dto.applyPenalty && requestedPenaltyMode === 'FIXED' && (!Number.isFinite(requestedPenaltyAmount) || requestedPenaltyAmount <= 0 || requestedPenaltyAmount > 10)) {
        throw new BadRequestException('Số điểm trừ phải lớn hơn 0 và không vượt quá 10');
      }
      if (!note) {
        throw new BadRequestException('Cần ghi chú khi xác nhận cần xử lý vụ việc');
      }
    }

    const activeAdjustments = await this.prisma.scoreAdjustment.aggregate({
      where: { submissionId, revokedAt: null },
      _sum: { amount: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.integrityReview.findUnique({ where: { submissionId } });
      const now = new Date();
      const academicScore = Number(Math.max(0, Math.min(10,
        this.toNumber(submission.score, 0) + this.toNumber(activeAdjustments._sum.amount, 0),
      )).toFixed(2));
      const hasExistingPenalty = existing?.status === 'CONFIRMED'
        && (existing?.penaltyPercent != null || existing?.penaltyAmount != null);
      const keepsExistingPenalty = dto.status === 'REVIEWED' && hasExistingPenalty;
      const keepsPenaltyOnConfirmation = dto.status === 'CONFIRMED'
        && !dto.applyPenalty
        && hasExistingPenalty;
      const shouldApplyPenalty = dto.status === 'CONFIRMED' && dto.applyPenalty;
      const keepsPenalty = keepsExistingPenalty || keepsPenaltyOnConfirmation;
      const existingPenaltyMode = existing?.penaltyMode === 'FIXED' ? 'FIXED' : 'PERCENT';
      const penaltyMode = shouldApplyPenalty
        ? requestedPenaltyMode
        : (keepsPenalty ? existingPenaltyMode : null);
      const penaltyPercent = penaltyMode === 'PERCENT'
        ? (shouldApplyPenalty ? Number(dto.deductionPercent) : existing?.penaltyPercent ?? null)
        : null;
      const penaltyAmount = penaltyMode === 'FIXED'
        ? (shouldApplyPenalty ? Number(requestedPenaltyAmount.toFixed(2)) : existing?.penaltyAmount ?? null)
        : null;
      const deductedScore = penaltyMode === null
        ? null
        : penaltyMode === 'FIXED'
          ? Number(Math.min(academicScore, this.toNumber(penaltyAmount, 0)).toFixed(2))
          : Number((academicScore * this.toNumber(penaltyPercent, 0) / 100).toFixed(2));
      const finalScore = penaltyMode === null
        ? null
        : Number(Math.max(0, academicScore - (deductedScore || 0)).toFixed(2));
      const priorPercent = existing?.penaltyPercent ?? null;

      const review = await tx.integrityReview.upsert({
        where: { submissionId },
        create: {
          submissionId,
          status: keepsExistingPenalty ? 'CONFIRMED' : dto.status,
          reviewerId: user.id,
          reviewerNote: note || null,
          decidedAt: now,
          penaltyMode,
          penaltyPercent,
          penaltyAmount,
          academicScore: penaltyMode === null ? null : academicScore,
          deductedScore,
          finalScore,
          penaltyAppliedAt: penaltyMode === null ? null : (shouldApplyPenalty ? now : existing?.penaltyAppliedAt ?? now),
        },
        update: {
          status: keepsExistingPenalty ? 'CONFIRMED' : dto.status,
          reviewerId: user.id,
          reviewerNote: note || null,
          decidedAt: now,
          penaltyMode,
          penaltyPercent,
          penaltyAmount,
          academicScore: penaltyMode === null ? null : academicScore,
          deductedScore,
          finalScore,
          penaltyAppliedAt: penaltyMode === null ? null : (shouldApplyPenalty ? now : existing?.penaltyAppliedAt ?? now),
        },
      });

      await tx.integrityReviewAudit.create({
        data: {
          integrityReviewId: review.id,
          action: dto.status === 'CONFIRMED'
            ? (shouldApplyPenalty ? (requestedPenaltyMode === 'FIXED' ? (priorPercent === null && (existing?.penaltyAmount ?? null) === null ? 'PENALTY_FIXED_APPLIED' : 'PENALTY_FIXED_UPDATED') : (priorPercent === null ? 'PENALTY_APPLIED' : 'PENALTY_UPDATED')) : 'CONFIRMED_NO_PENALTY')
            : (dto.status === 'DISMISSED' && existing?.status === 'CONFIRMED' ? 'PENALTY_REVOKED' : dto.status),
          previousPercent: priorPercent,
          nextPercent: penaltyPercent,
          academicScore: penaltyMode === null ? this.toNumber(submission.score, 0) : academicScore,
          deductedScore,
          finalScore: penaltyMode === null ? this.toNumber(submission.score, 0) : finalScore,
          note: note || null,
          actorId: user.id,
        },
      });

      return review;
    });
  }

  private buildSubmitResponse(
    submission: {
      id: string;
      status: string;
      attemptNo: number;
      submittedAt: Date | null;
      gradedAt?: Date | null;
      score?: number | null;
      version?: number | null;
      submitIdempotencyKey?: string | null;
    },
    duplicate = false,
  ) {
    return {
      submissionId: submission.id,
      status: submission.status,
      attemptNo: submission.attemptNo,
      submittedAt: submission.submittedAt ? submission.submittedAt.toISOString() : null,
      gradedAt: submission.gradedAt ? submission.gradedAt.toISOString() : null,
      score: submission.score ?? null,
      serverVersion: submission.version ?? null,
      duplicate,
      idempotencyKey: submission.submitIdempotencyKey ?? null,
    };
  }

  private async recalculateSubmissionScore(submissionId: string, client: any = this.prisma) {
    const submission = await client.examSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        status: true,
        examSnapshot: {
          select: {
            questions: {
              select: {
                questionId: true,
                questionVersionId: true,
                questionSnapshotId: true,
                orderIndex: true,
                assignedScore: true,
                payload: true,
                questionSnapshot: { select: { payload: true } },
              },
            },
          },
        },
        answers: {
          select: {
            questionId: true,
            pointsAwarded: true,
            manualGradedAt: true,
          },
        },
      },
    });

    if (!submission) throw new NotFoundException('Không tìm thấy lượt làm bài');

    const snapshotQuestions = this.mapSnapshotQuestions(submission.examSnapshot?.questions || []);
    const answersByQuestionId = new Map<string, { manualGradedAt: Date | null }>(
      submission.answers.map((answer) => [answer.questionId, answer]),
    );
    const rawScore = submission.answers.reduce(
      (sum, answer) => sum + this.toNumber(answer.pointsAwarded),
      0,
    );
    const maxRawScore = snapshotQuestions.reduce(
      (sum, question) => sum + this.toNumber(question.assignedScore),
      0,
    );
    const pendingManualGrading = snapshotQuestions.some((question) => {
      if (this.isAutoGradable(question.type, question.answerKey)) return false;
      return !answersByQuestionId.get(question.questionId)?.manualGradedAt;
    });
    const gradingComplete = !pendingManualGrading;
    const nextStatus = submission.status === 'FINALIZED'
      ? 'FINALIZED'
      : gradingComplete
        ? 'GRADED'
        : 'SUBMITTED';

    return client.examSubmission.update({
      where: { id: submissionId },
      data: {
        score: this.normalizeScore(rawScore, maxRawScore),
        status: nextStatus,
        gradedAt: gradingComplete ? new Date() : null,
      },
      select: { id: true, score: true, status: true, gradedAt: true },
    });
  }

  async gradeAnswer(gradeDto: GradeAnswerDto, actor: { id: string; role?: string }) {
    await this.accessPolicy.assertInstructorCanAccessSubmissionAnswer(gradeDto.submissionAnswerId, actor);

    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.submissionAnswer.findUnique({
        where: { id: gradeDto.submissionAnswerId },
        select: {
          id: true,
          submissionId: true,
          questionId: true,
          questionVersionId: true,
          pointsAwarded: true,
          manualGradedAt: true,
          feedback: true,
          question: {
            select: {
              points: true,
              defaultPoints: true,
            },
          },
          questionVersion: {
            select: {
              points: true,
            },
          },
          questionSnapshot: {
            select: {
              payload: true,
            },
          },
        },
      });

      if (!existing) {
        throw new NotFoundException('Không tìm thấy câu trả lời');
      }

      const snapshotPayload = this.parseJsonValue(existing.questionSnapshot?.payload, {});
      const maxPoints = Number(
        snapshotPayload.assignedScore ??
        snapshotPayload.points ??
        existing.questionVersion?.points ??
          existing.question.points ??
          existing.question.defaultPoints ??
          1,
      );
      if (gradeDto.pointsAwarded > maxPoints) {
        throw new BadRequestException(`Điểm chấm không được vượt quá ${maxPoints}`);
      }

      const next = await tx.submissionAnswer.update({
        where: { id: gradeDto.submissionAnswerId },
        data: {
          pointsAwarded: gradeDto.pointsAwarded,
          manualGradedAt: new Date(),
          feedback: gradeDto.feedback,
        },
      });

      if (
        existing.pointsAwarded !== gradeDto.pointsAwarded ||
        String(existing.feedback || '') !== String(gradeDto.feedback || '')
      ) {
        await tx.examSubmissionRegradeLog.create({
          data: {
            submissionId: existing.submissionId,
            submissionAnswerId: existing.id,
            reviewerId: actor.id,
            previousPoints: existing.pointsAwarded ?? null,
            newPoints: gradeDto.pointsAwarded,
            previousFeedback: existing.feedback ?? null,
            newFeedback: gradeDto.feedback ?? null,
            reason: gradeDto.reason || 'Manual regrade',
          } as any,
        });
      }

      // Manual questions are excluded from correct/incorrect at submission
      // time (see submitExam) precisely so they can be counted here, once an
      // actual grading decision exists — either the first time this answer
      // is graded, or when a regrade moves it across the "0 points" line.
      if (existing.questionVersionId) {
        const wasGraded = existing.manualGradedAt !== null;
        const wasCorrect = wasGraded && Number(existing.pointsAwarded || 0) > 0;
        const isNowCorrect = Number(gradeDto.pointsAwarded || 0) > 0;
        if (!wasGraded || wasCorrect !== isNowCorrect) {
          const correctDelta = !wasGraded ? (isNowCorrect ? 1 : 0) : (isNowCorrect ? 1 : -1);
          const incorrectDelta = !wasGraded ? (isNowCorrect ? 0 : 1) : (isNowCorrect ? -1 : 1);
          await tx.questionStatistics.upsert({
            where: { questionVersionId: existing.questionVersionId },
            create: {
              questionVersionId: existing.questionVersionId,
              questionId: existing.questionId,
              totalAttempts: !wasGraded ? 1 : 0,
              correctAttempts: Math.max(0, correctDelta),
              incorrectAttempts: Math.max(0, incorrectDelta),
              skippedAttempts: 0,
              pValue: isNowCorrect ? 1 : 0,
              difficultyIndex: isNowCorrect ? 0 : 1,
              lastRecomputedAt: new Date(),
            },
            update: {
              totalAttempts: !wasGraded ? { increment: 1 } : undefined,
              correctAttempts: { increment: correctDelta },
              incorrectAttempts: { increment: incorrectDelta },
              lastRecomputedAt: new Date(),
            },
          });
        }
      }

      const recalculated = await this.recalculateSubmissionScore(existing.submissionId, tx);
      // Keep any confirmed integrity penalty in sync with the base score —
      // otherwise a penalty applied while manual grading was still pending
      // stays frozen against that partial score forever. No-ops when there's
      // no penalty on this submission.
      await this.refreshIntegrityScoreAfterAdjustment(tx, existing.submissionId, this.toNumber(recalculated.score));
      return next;
    });

    return updated;
  }

  private extractAnswerText(answer: any): string {
    if (answer === null || typeof answer === 'undefined') return '';
    if (typeof answer === 'string') return answer;
    if (typeof answer === 'object') {
      for (const key of ['answer', 'text', 'content', 'value']) {
        if (key in answer && typeof answer[key] === 'string') return answer[key];
      }
    }
    return '';
  }

  async suggestGradeForAnswer(submissionAnswerId: string, actor: { id: string; role?: string }) {
    await this.accessPolicy.assertInstructorCanAccessSubmissionAnswer(submissionAnswerId, actor);

    const answer = await this.prisma.submissionAnswer.findUnique({
      where: { id: submissionAnswerId },
      select: {
        answer: true,
        question: {
          select: {
            type: true,
            content: true,
            correctAnswer: true,
            explanation: true,
            points: true,
            defaultPoints: true,
          },
        },
        questionVersion: {
          select: { stem: true, points: true },
        },
        questionSnapshot: {
          select: { payload: true },
        },
      },
    });

    if (!answer) {
      throw new NotFoundException('Không tìm thấy câu trả lời');
    }

    const snapshotPayload = this.parseJsonValue(answer.questionSnapshot?.payload, {});
    const maxPoints = Number(
      snapshotPayload.assignedScore ??
      snapshotPayload.points ??
      answer.questionVersion?.points ??
        answer.question?.points ??
        answer.question?.defaultPoints ??
        1,
    );
    const questionText = answer.questionVersion?.stem || answer.question?.content || '';
    const referenceAnswer = this.extractAnswerText(this.parseJsonValue(answer.question?.correctAnswer, null));
    const studentAnswer = this.extractAnswerText(this.parseJsonValue(answer.answer, answer.answer));

    return this.aiService.suggestEssayGrade({
      questionText,
      studentAnswer,
      maxPoints,
      referenceAnswer: referenceAnswer || undefined,
      explanation: answer.question?.explanation || undefined,
      context: { questionType: String(answer.question?.type || 'ESSAY') },
    });
  }

  async finalizeSubmission(submissionId: string): Promise<void> {
    const submission = await this.prisma.examSubmission.findUnique({
      where: { id: submissionId },
      include: { exam: true },
    });

    if (!submission) {
      throw new NotFoundException('Không tìm thấy lượt làm bài');
    }

    await this.prisma.examSubmission.update({
      where: { id: submissionId },
      data: { status: 'FINALIZED' },
    });


  }

  async finalizeGrading(submissionId: string, user?: RequestUser): Promise<void> {
    if (user) {
      await this.accessPolicy.assertInstructorCanAccessSubmission(submissionId, user);
    }

    const submission = await this.prisma.examSubmission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException('Không tìm thấy lượt làm bài');
    }

    await this.prisma.examSubmission.update({
      where: { id: submissionId },
      data: { status: 'FINALIZED' },
    });
  }

  async findByExam(examId: string, pagination?: PaginationDto, user?: RequestUser) {
    if (user) {
      await this.accessPolicy.assertInstructorCanAccessExam(examId, user);
    }

    const where = { examId };
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;

    const [submissions, total] = await Promise.all([
      this.prisma.examSubmission.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              email: true,
              studentId: true,
            },
          },
          exam: {
            select: {
              id: true,
              title: true,
              totalPoints: true,
              duration: true,
              timeLimitMinutes: true,
              settings: true,
            },
          },
          examInstance: {
            select: {
              id: true,
              status: true,
              startedAt: true,
              submittedAt: true,
              lastActivityAt: true,
              suspiciousFlag: true,
              anomalyScore: true,
            },
          },
          proctoring: {
            select: {
              id: true,
              tabSwitchCount: true,
              mouseAnomalies: true,
              flaggedStatus: true,
              integrityScore: true,
            },
          },
          answers: {
            select: {
              id: true,
            },
          },
          scoreAdjustments: {
            where: { revokedAt: null },
            select: { id: true, amount: true },
          },
          integrityReview: {
            select: {
              status: true,
              reviewerNote: true,
              penaltyMode: true,
              penaltyPercent: true,
              penaltyAmount: true,
              deductedScore: true,
              finalScore: true,
            },
          },
          _count: {
            select: {
              evidenceCaptures: { where: { status: { not: 'PURGED' } } },
            },
          },
          evidenceCaptures: {
            where: { status: { not: 'PURGED' }, reviewStatus: 'PENDING' },
            select: { id: true },
          },
        },
        orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.examSubmission.count({ where }),
    ]);

    const rows = submissions.map((submission) => {
      const adjustmentTotal = submission.scoreAdjustments.reduce(
        (total, adjustment) => total + this.toNumber(adjustment.amount),
        0,
      );
      const baseScore = this.toNumber(submission.score);
      const adjustedScore = Number(Math.max(0, Math.min(10, baseScore + adjustmentTotal)).toFixed(2));
      const totalPoints = submission.exam?.totalPoints != null
        ? submission.exam.totalPoints
        : 10;
      const timingSignal = this.getFastCompletionSignal({
        startedAt: submission.startedAt,
        submittedAt: submission.submittedAt,
        score: adjustedScore,
        exam: submission.exam,
      });
      return {
        ...submission,
        scoreAdjustments: undefined,
        academicScore: baseScore,
        adjustmentTotal: Number(adjustmentTotal.toFixed(2)),
        score: adjustedScore,
        totalPoints,
        timingSignal,
        deadline: this.resolveSubmissionDeadline(submission)?.toISOString() ?? null,
        evidenceCaptureCount: submission._count.evidenceCaptures,
        evidenceUnreviewedCount: submission.evidenceCaptures.length,
        _count: undefined,
        evidenceCaptures: undefined,
      };
    });

    return buildPaginatedResult(rows, total, page, limit);
  }

  /**
   * Lecturer/admin-only comparison view. It deliberately returns classifications
   * only: never the correct answers or the students' answer payloads.
   */
  async getExamAnswerMatrix(examId: string, user?: RequestUser, attemptNo?: number) {
    if (user) {
      await this.accessPolicy.assertInstructorCanAccessExam(examId, user);
    }

    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, title: true, maxAttempts: true, questionSelectionConfig: true, settings: true },
    });
    if (!exam) throw new NotFoundException('Không tìm thấy bài thi');

    const maxAttempts = Number(exam.maxAttempts);

    // The matrix is one row per student, so it can only ever compare one
    // attempt at a time — with multiple attempts allowed, ambiguously mixing
    // rows from different attempts would make columns/cells meaningless.
    // Resolve which attempt to show instead of just rejecting multi-attempt
    // exams outright, defaulting to attempt 1.
    const distinctAttempts = await this.prisma.examSubmission.findMany({
      where: { examId },
      select: { attemptNo: true },
      distinct: ['attemptNo'],
      orderBy: { attemptNo: 'asc' },
    });
    const availableAttempts = distinctAttempts.map((row) => row.attemptNo);
    const resolvedAttemptNo = attemptNo && availableAttempts.includes(attemptNo)
      ? attemptNo
      : (availableAttempts[0] ?? 1);

    const submissions = await this.prisma.examSubmission.findMany({
      where: { examId, attemptNo: resolvedAttemptNo },
      select: {
        id: true,
        status: true,
        submittedAt: true,
        createdAt: true,
        student: { select: { fullName: true, studentId: true } },
        examSnapshot: {
          select: {
            questions: {
              select: {
                questionId: true,
                questionVersionId: true,
                questionSnapshotId: true,
                orderIndex: true,
                payload: true,
                questionSnapshot: { select: { id: true, payload: true } },
              },
            },
          },
        },
        answers: {
          select: {
            questionId: true,
            questionVersionId: true,
            questionSnapshotId: true,
            answer: true,
            isCorrect: true,
            pointsAwarded: true,
            manualGradedAt: true,
          },
        },
      },
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const selectionConfig = this.parseJsonValue(
      exam.questionSelectionConfig ?? exam.settings,
      {},
    ) as any;
    const settings = this.parseJsonValue(exam.settings, {}) as any;
    const randomCount = Math.max(
      0,
      Number(
        selectionConfig?.randomRequestedQuestionCount ??
        selectionConfig?.requestedQuestionCount ??
        selectionConfig?.sources?.randomTopicCount ??
        settings?.randomRequestedQuestionCount ??
        settings?.requestedQuestionCount ??
        0,
      ) || 0,
    );

    const columns = new Map<string, any>();
    for (const submission of submissions) {
      for (const snapshotQuestion of submission.examSnapshot?.questions || []) {
        const merged = {
          ...this.parseJsonValue(snapshotQuestion.payload, {}),
          ...this.parseJsonValue(snapshotQuestion.questionSnapshot?.payload, {}),
        } as any;
        const key = snapshotQuestion.questionSnapshotId ||
          snapshotQuestion.questionVersionId ||
          snapshotQuestion.questionId;
        const orderIndex = Number(snapshotQuestion.orderIndex || 0);
        const isRandomBankQuestion = randomCount > 0 && orderIndex > 0 && orderIndex > (
          (submission.examSnapshot?.questions?.length || 0) - randomCount
        );
        const existing = columns.get(key);
        columns.set(key, {
          key,
          questionId: snapshotQuestion.questionId,
          questionSnapshotId: snapshotQuestion.questionSnapshotId || snapshotQuestion.questionSnapshot?.id || null,
          questionVersionId: snapshotQuestion.questionVersionId || null,
          stem: String(merged.stem || merged.content || 'Nội dung câu hỏi không khả dụng'),
          type: String(merged.type || existing?.type || ''),
          assignedScore: Number(merged.assignedScore ?? merged.points ?? existing?.assignedScore ?? 0),
          orderIndex: Math.min(existing?.orderIndex ?? Number.MAX_SAFE_INTEGER, orderIndex || Number.MAX_SAFE_INTEGER),
          isRandomBankQuestion: Boolean(existing?.isRandomBankQuestion || isRandomBankQuestion),
        });
      }
    }
    const questionColumns = [...columns.values()]
      .sort((left, right) => left.orderIndex - right.orderIndex || left.key.localeCompare(right.key))
      .map((column, index) => ({ ...column, label: `C${index + 1}` }));

    const isBlank = (value: any): boolean => {
      const parsed = this.parseJsonValue(value, value);
      if (parsed === null || typeof parsed === 'undefined') return true;
      if (typeof parsed === 'string') return parsed.trim().length === 0;
      if (Array.isArray(parsed)) return parsed.length === 0;
      if (typeof parsed === 'object') return Object.keys(parsed).length === 0 ||
        Object.values(parsed).every((item) => item === null || item === '' || (Array.isArray(item) && item.length === 0));
      return false;
    };

    const students = submissions.map((submission) => {
      const assignedKeys = new Set((submission.examSnapshot?.questions || []).map((question) =>
        question.questionSnapshotId || question.questionVersionId || question.questionId,
      ));
      const answersByKey = new Map<string, any>((submission.answers || []).map((answer) => [
        answer.questionSnapshotId || answer.questionVersionId || answer.questionId,
        answer,
      ]));
      const cells = Object.fromEntries(questionColumns.map((column) => {
        if (column.isRandomBankQuestion) return [column.key, 'RANDOM_NOT_COMPARABLE'];
        if (!assignedKeys.has(column.key)) return [column.key, 'NOT_ASSIGNED'];
        const answer = answersByKey.get(column.key);
        if (!answer || isBlank(answer.answer)) return [column.key, 'BLANK'];
        if (!answer.manualGradedAt && answer.isCorrect === null) return [column.key, 'PENDING_MANUAL'];
        if (answer.manualGradedAt) {
          // Manually-graded (essay/short-answer) answers are almost never a
          // clean right/wrong — a 1/10 partial-credit essay isn't "correct",
          // but calling it flatly "incorrect" alongside a 0/10 essay loses
          // just as much information. Report the actual score band instead
          // of forcing it into the auto-graded CORRECT/INCORRECT states, so
          // the matrix cell itself signals "this was graded on a scale" and
          // roughly where on that scale it landed.
          const ratio = column.assignedScore > 0
            ? Number(answer.pointsAwarded || 0) / column.assignedScore
            : (Number(answer.pointsAwarded || 0) > 0 ? 1 : 0);
          if (ratio >= 0.75) return [column.key, 'ESSAY_STRONG'];
          if (ratio >= 0.5) return [column.key, 'ESSAY_MODERATE'];
          if (ratio >= 0.25) return [column.key, 'ESSAY_WEAK'];
          return [column.key, 'ESSAY_POOR'];
        }
        if (answer.isCorrect === true) return [column.key, 'CORRECT'];
        return [column.key, 'INCORRECT'];
      }));
      return {
        submissionId: submission.id,
        student: submission.student,
        status: submission.status,
        cells,
      };
    });

    return {
      exam: { id: exam.id, title: exam.title, maxAttempts },
      submittedCount: submissions.filter((item) => item.submittedAt).length,
      students,
      questionColumns,
      availableAttempts,
      selectedAttemptNo: resolvedAttemptNo,
    };
  }

  async getManualGradingStatus(examId: string, user?: RequestUser) {
    if (user) {
      await this.accessPolicy.assertInstructorCanAccessExam(examId, user);
    }

    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, title: true, resultsPublishedAt: true },
    });

    if (!exam) {
      throw new NotFoundException('Không tìm thấy bài thi');
    }

    const submissions = await this.prisma.examSubmission.findMany({
      where: {
        examId,
        status: { in: ['SUBMITTED', 'GRADED', 'FLAGGED', 'FINALIZED'] },
      },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            studentId: true,
            email: true,
          },
        },
        answers: {
          include: {
            question: {
              select: {
                id: true,
                type: true,
                points: true,
                defaultPoints: true,
                content: true,
                correctAnswer: true,
              },
            },
            questionVersion: {
              select: {
                id: true,
                stem: true,
                points: true,
              },
            },
          },
        },
      },
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const rows = submissions.map((submission) => {
      const manualAnswers = submission.answers.filter(
        (answer) => !this.isAutoGradable(
          String(answer.question?.type || '').toUpperCase(),
          this.parseJsonValue(answer.question?.correctAnswer, null),
        ),
      );
      const graded = manualAnswers.filter((answer) => answer.manualGradedAt !== null && answer.manualGradedAt !== undefined);
      return {
        submissionId: submission.id,
        student: submission.student,
        status: submission.status,
        attemptNo: submission.attemptNo,
        submittedAt: submission.submittedAt,
        score: submission.score,
        manualTotal: manualAnswers.length,
        manualGraded: graded.length,
        manualPending: Math.max(0, manualAnswers.length - graded.length),
        completed: manualAnswers.length > 0 && manualAnswers.length === graded.length,
      };
    });

    const manualTotal = rows.reduce((sum, row) => sum + row.manualTotal, 0);
    const manualGraded = rows.reduce((sum, row) => sum + row.manualGraded, 0);
    // `resultsPublishedAt` is the only real source of truth for "published"
    // (it's what gates score/answer visibility in sanitizeStudentSubmissionView).
    // Submission status alone is not — a pure auto-graded exam has every
    // submission at GRADED the instant a student submits, long before anyone
    // has published anything.
    const published = Boolean(exam.resultsPublishedAt);

    return {
      exam,
      hasManualGrading: manualTotal > 0,
      manualTotal,
      manualGraded,
      manualPending: Math.max(0, manualTotal - manualGraded),
      published,
      canPublish: rows.length > 0 && !published && manualTotal === manualGraded,
      submissions: rows,
    };
  }

  async getManualGradingSubmission(submissionId: string, user?: RequestUser) {
    if (user) {
      await this.accessPolicy.assertInstructorCanAccessSubmission(submissionId, user);
    }

    const submission = await this.prisma.examSubmission.findUnique({
      where: { id: submissionId },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            studentId: true,
            email: true,
          },
        },
        exam: {
          select: {
            id: true,
            title: true,
            totalPoints: true,
            course: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
        answers: {
          orderBy: [{ questionId: 'asc' }, { sequence: 'asc' }],
          include: {
            question: {
              select: {
                id: true,
                type: true,
                content: true,
                options: true,
                points: true,
                defaultPoints: true,
                correctAnswer: true,
                mediaType: true,
                mediaUrl: true,
              },
            },
            questionVersion: {
              select: {
                id: true,
                stem: true,
                payload: true,
                points: true,
              },
            },
            questionSnapshot: {
              select: { payload: true },
            },
          },
        },
        scoreAdjustments: {
          orderBy: { createdAt: 'desc' },
          include: {
            createdBy: { select: { id: true, fullName: true } },
            revokedBy: { select: { id: true, fullName: true } },
          },
        },
        integrityReview: {
          select: {
            status: true,
            reviewerNote: true,
            penaltyMode: true,
            penaltyPercent: true,
            penaltyAmount: true,
            deductedScore: true,
            finalScore: true,
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Không tìm thấy lượt làm bài');
    }

    const isManualAnswer = (answer: (typeof submission.answers)[number]) => !this.isAutoGradable(
      String(answer.question?.type || '').toUpperCase(),
      this.parseJsonValue(answer.question?.correctAnswer, null),
    );

    const manualAnswers = submission.answers
      .filter(isManualAnswer)
      .map((answer) => {
        const snapshotPayload = this.parseJsonValue(answer.questionSnapshot?.payload, {});
        const versionPayload = this.parseJsonValue(answer.questionVersion?.payload, {});
        return {
        id: answer.id,
        questionId: answer.questionId,
        questionType: answer.question?.type,
        questionText: answer.questionVersion?.stem || answer.question?.content || 'Question text unavailable',
        questionOptions: snapshotPayload.options ?? versionPayload.options ?? answer.question?.options ?? null,
        questionMediaType: answer.question?.mediaType ?? null,
        questionMediaUrl: answer.question?.mediaUrl ?? null,
        answer: answer.answer,
        pointsAwarded: answer.pointsAwarded,
        manualGradedAt: answer.manualGradedAt,
        maxPoints: Number(
          snapshotPayload.assignedScore ??
          snapshotPayload.points ??
          answer.questionVersion?.points ??
          answer.question?.points ??
          answer.question?.defaultPoints ??
          1,
        ),
        feedback: answer.feedback || '',
        updatedAt: answer.updatedAt,
        };
      });

    const autoAnswers = submission.answers
      .filter((answer) => !isManualAnswer(answer))
      .map((answer) => {
        const snapshotPayload = this.parseJsonValue(answer.questionSnapshot?.payload, {});
        const versionPayload = this.parseJsonValue(answer.questionVersion?.payload, {});
        return {
          id: answer.id,
          questionId: answer.questionId,
          questionType: answer.question?.type,
          questionText: answer.questionVersion?.stem || answer.question?.content || 'Question text unavailable',
          questionOptions: snapshotPayload.options ?? versionPayload.options ?? answer.question?.options ?? null,
          questionMediaType: answer.question?.mediaType ?? null,
          questionMediaUrl: answer.question?.mediaUrl ?? null,
          answer: answer.answer,
          correctAnswer: snapshotPayload.answerKey ?? snapshotPayload.correctAnswer
            ?? this.parseJsonValue(answer.question?.correctAnswer, null),
          isCorrect: answer.isCorrect,
          pointsAwarded: answer.pointsAwarded,
          maxPoints: Number(
            snapshotPayload.assignedScore ??
            snapshotPayload.points ??
            answer.questionVersion?.points ??
            answer.question?.points ??
            answer.question?.defaultPoints ??
            1,
          ),
          updatedAt: answer.updatedAt,
        };
      });

    const activeAdjustmentTotal = submission.scoreAdjustments
      .filter((adjustment) => !adjustment.revokedAt)
      .reduce((total, adjustment) => total + this.toNumber(adjustment.amount), 0);
    const academicScore = this.toNumber(submission.score);

    return {
      ...submission,
      manualAnswers,
      manualTotal: manualAnswers.length,
      manualGraded: manualAnswers.filter((answer) => answer.manualGradedAt !== null && answer.manualGradedAt !== undefined).length,
      autoAnswers,
      autoTotal: autoAnswers.length,
      autoCorrect: autoAnswers.filter((answer) => answer.isCorrect === true).length,
      academicScore,
      activeAdjustmentTotal: Number(activeAdjustmentTotal.toFixed(2)),
      adjustedAcademicScore: Number(Math.max(0, Math.min(10, academicScore + activeAdjustmentTotal)).toFixed(2)),
    };
  }

  private async refreshIntegrityScoreAfterAdjustment(tx: any, submissionId: string, baseScore: number) {
    const review = await tx.integrityReview.findUnique({ where: { submissionId } });
    const penaltyMode = review?.penaltyMode === 'FIXED' ? 'FIXED' : (review?.penaltyPercent ? 'PERCENT' : null);
    if (!penaltyMode) return;

    const adjustments = await tx.scoreAdjustment.findMany({
      where: { submissionId, revokedAt: null },
      select: { amount: true },
    });
    const adjustedAcademicScore = Math.max(0, Math.min(10, baseScore + adjustments.reduce(
      (total: number, adjustment: { amount: any }) => total + this.toNumber(adjustment.amount),
      0,
    )));
    const deductedScore = penaltyMode === 'FIXED'
      ? Number(Math.min(adjustedAcademicScore, this.toNumber(review.penaltyAmount, 0)).toFixed(2))
      : Number((adjustedAcademicScore * Number(review.penaltyPercent) / 100).toFixed(2));
    const finalScore = Number(Math.max(0, adjustedAcademicScore - deductedScore).toFixed(2));

    await tx.integrityReview.update({
      where: { submissionId },
      data: { academicScore: adjustedAcademicScore, deductedScore, finalScore, penaltyAppliedAt: new Date() },
    });
  }

  async createScoreAdjustment(
    submissionId: string,
    dto: { amount: number; category: 'QUESTION_ERROR' | 'PARTICIPATION' | 'OTHER'; reason?: string },
    user: RequestUser,
  ) {
    const amount = Number(dto.amount);
    const reason = String(dto.reason || '').trim();
    if (!Number.isFinite(amount) || amount === 0) {
      throw new BadRequestException('Số điểm điều chỉnh phải khác 0');
    }
    // Only the catch-all "Khác" category needs a free-text reason — the other
    // categories are already self-explanatory as a label.
    if (dto.category === 'OTHER' && !reason) {
      throw new BadRequestException("Cần nhập lý do khi chọn loại 'Khác'");
    }

    const submission = await this.prisma.examSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, examId: true, score: true, status: true },
    });
    if (!submission) throw new NotFoundException('Không tìm thấy lượt làm bài');
    await this.accessPolicy.assertInstructorCanAccessExam(submission.examId, user);
    if (!['SUBMITTED', 'GRADED', 'FLAGGED', 'FINALIZED'].includes(String(submission.status).toUpperCase())) {
      throw new ConflictException('Chỉ có thể điều chỉnh điểm sau khi bài đã được nộp');
    }

    return this.prisma.$transaction(async (tx) => {
      const adjustment = await tx.scoreAdjustment.create({
        data: { submissionId, amount, category: dto.category, reason, createdById: user.id },
        include: { createdBy: { select: { id: true, fullName: true } } },
      });
      await this.refreshIntegrityScoreAfterAdjustment(tx, submissionId, this.toNumber(submission.score));
      return adjustment;
    });
  }

  async revokeScoreAdjustment(
    submissionId: string,
    adjustmentId: string,
    dto: { reason: string },
    user: RequestUser,
  ) {
    const reason = String(dto.reason || '').trim();
    if (!reason) throw new BadRequestException('Cần nhập lý do khi hủy điều chỉnh điểm');

    const submission = await this.prisma.examSubmission.findUnique({
      where: { id: submissionId },
      select: { id: true, examId: true, score: true },
    });
    if (!submission) throw new NotFoundException('Không tìm thấy lượt làm bài');
    await this.accessPolicy.assertInstructorCanAccessExam(submission.examId, user);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.scoreAdjustment.findFirst({ where: { id: adjustmentId, submissionId } });
      if (!existing) throw new NotFoundException('Không tìm thấy điều chỉnh điểm');
      if (existing.revokedAt) throw new ConflictException('Điều chỉnh điểm này đã bị hủy trước đó');

      const revoked = await tx.scoreAdjustment.update({
        where: { id: adjustmentId },
        data: { revokedAt: new Date(), revokedById: user.id, revocationReason: reason },
        include: { revokedBy: { select: { id: true, fullName: true } } },
      });
      await this.refreshIntegrityScoreAfterAdjustment(tx, submissionId, this.toNumber(submission.score));
      return revoked;
    });
  }

  async publishExamResults(examId: string, user?: RequestUser) {
    const status = await this.getManualGradingStatus(examId, user);
    const publishedAt = new Date();
    // Automatically graded exams still need an explicit publication decision
    // before answer keys are made available to students.
    if (!status.hasManualGrading) {
      await this.prisma.exam.update({
        where: { id: examId },
        data: { resultsPublishedAt: publishedAt },
      });
      return this.getManualGradingStatus(examId, user);
    }

    if (!status.canPublish) {
      throw new BadRequestException('Cần chấm điểm tất cả các câu tự luận trước khi công bố kết quả.');
    }

    const submissionIds = status.submissions.map((row) => row.submissionId);
    const answers = await this.prisma.submissionAnswer.findMany({
      where: { submissionId: { in: submissionIds } },
      select: {
        submissionId: true,
        pointsAwarded: true,
      },
    });
    const submissions = await this.prisma.examSubmission.findMany({
      where: { id: { in: submissionIds } },
      select: {
        id: true,
        examInstanceId: true,
        examSnapshot: {
          include: {
            questions: {
              include: {
                questionSnapshot: true,
              },
            },
          },
        },
      },
    });

    const scoreBySubmission = new Map<string, number>();
    for (const answer of answers) {
      scoreBySubmission.set(
        answer.submissionId,
        (scoreBySubmission.get(answer.submissionId) || 0) + Number(answer.pointsAwarded || 0),
      );
    }
    const maxRawScoreBySubmission = new Map<string, number>();
    for (const submission of submissions) {
      const snapshotQuestions = this.mapSnapshotQuestions(submission.examSnapshot?.questions || []);
      const maxRawScore = snapshotQuestions.reduce((sum, question) => sum + Number(question.assignedScore || 0), 0);
      maxRawScoreBySubmission.set(submission.id, maxRawScore);
    }

    const now = publishedAt;
    await this.prisma.$transaction(async (tx) => {
      for (const submission of submissions) {
        const rawScore = scoreBySubmission.get(submission.id) || 0;
        const maxRawScore = maxRawScoreBySubmission.get(submission.id) || 0;
        const normalizedScore = this.normalizeScore(rawScore, maxRawScore);

        await tx.examSubmission.update({
          where: { id: submission.id },
          data: {
            status: 'GRADED',
            gradedAt: now,
            score: normalizedScore,
          },
        });

        if (submission.examInstanceId) {
          await tx.examInstance.update({
            where: { id: submission.examInstanceId },
            data: {
              status: 'GRADED',
              rawScore,
              maxRawScore,
              normalizedScore,
              lastActivityAt: now,
            },
          });
        }

        // Same reasoning as in gradeAnswer: publishing can be the moment a
        // submission's score first becomes final, so any confirmed penalty
        // must be recalculated against it here too.
        await this.refreshIntegrityScoreAfterAdjustment(tx, submission.id, normalizedScore);
      }
    });

    await this.prisma.exam.update({
      where: { id: examId },
      data: { resultsPublishedAt: publishedAt },
    });

    return this.getManualGradingStatus(examId, user);
  }

  private parseJsonValue(value: any, fallback: any = null) {
    if (value === null || typeof value === 'undefined') return fallback;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(String(value));
    } catch {
      return fallback;
    }
  }

  /**
   * Pulls a single option letter ("A"/"B"/"C"/"D"...) out of an answer/answerKey
   * JSON value, for the single-answer close-ended types (MULTIPLE_CHOICE,
   * TRUE_FALSE, FIND_ERROR) that store `{ answer: "X" }` (see
   * normalizeSubmissionAnswer on the client and buildQuestionSnapshotPayload
   * on the exam-publish path). Returns null for anything else (multi-select,
   * matching, ordering, fill-blank, essay, or malformed data) — this
   * intentionally only recognizes the shape it knows how to compare, rather
   * than guessing at multi-value or free-text answers.
   */
  private extractSingleAnswerLetter(raw: any): string | null {
    const parsed = this.parseJsonValue(raw, null);
    if (parsed === null || typeof parsed === 'undefined') return null;
    const candidate = typeof parsed === 'object' && parsed !== null ? parsed.answer : parsed;
    if (typeof candidate === 'boolean') return candidate ? 'TRUE' : 'FALSE';
    if (typeof candidate !== 'string') return null;
    const trimmed = candidate.trim().toUpperCase();
    // Reject multi-letter/comma-joined answers ("A,C") — those are
    // multi-select, not the single-option case this analysis compares.
    return /^[A-Z]$/.test(trimmed) ? trimmed : null;
  }

  private toNumber(value: any, fallback = 0): number {
    if (value === null || typeof value === 'undefined') return fallback;
    const parsed = Number(typeof value?.toString === 'function' ? value.toString() : value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  /**
   * Item-analysis technique: a distractor (wrong option) that is chosen more
   * often than the keyed correct answer is the classic statistical signature
   * of a mis-keyed item — e.g. the lecturer set "A" as correct but wrote the
   * question so "D" is actually right, so most students (correctly) pick D
   * and get marked wrong. A generic "high incorrect rate" flag can't tell
   * that apart from a genuinely hard-but-correctly-keyed question; this can,
   * because it looks at WHICH wrong option concentrates the misses rather
   * than just how many there are.
   *
   * Deliberately conservative — this is meant to be a confident, actionable
   * signal a lecturer can trust, not a guess:
   *   - Only single-answer close-ended types (MULTIPLE_CHOICE/TRUE_FALSE/
   *     FIND_ERROR) whose answer reduces to one option letter are evaluated.
   *   - Requires the key itself (never inferred from student answers, so it
   *     still works even if 100% of students were marked wrong).
   *   - Requires a minimum sample size so a handful of answers can't trigger it.
   *   - Requires the top distractor to outnumber the keyed answer AND clear
   *     an absolute floor, so a narrowly-more-popular wrong option on an
   *     otherwise close spread doesn't get over-flagged.
   */
  private detectPossibleKeyError(
    rows: Array<{ selectedLetter: string | null }>,
    correctOptionLetter: string | null,
  ): { mostPickedOptionLetter: string; mostPickedOptionRate: number; correctOptionLetter: string; correctOptionRate: number; sampleSize: number } | null {
    if (!correctOptionLetter) return null;

    const MIN_SAMPLE_SIZE = 5;
    const MIN_TOP_DISTRACTOR_RATE = 0.3;

    const withSelection = rows.filter((r) => r.selectedLetter);
    if (withSelection.length < MIN_SAMPLE_SIZE) return null;

    const counts = new Map<string, number>();
    for (const row of withSelection) {
      const letter = row.selectedLetter!;
      counts.set(letter, (counts.get(letter) || 0) + 1);
    }

    let topLetter = correctOptionLetter;
    let topCount = 0;
    for (const [letter, count] of counts) {
      if (letter === correctOptionLetter) continue;
      if (count > topCount) {
        topLetter = letter;
        topCount = count;
      }
    }
    if (topLetter === correctOptionLetter) return null;

    const correctCount = counts.get(correctOptionLetter) || 0;
    const total = withSelection.length;
    const topRate = topCount / total;
    const correctRate = correctCount / total;

    if (topCount <= correctCount) return null;
    if (topRate < MIN_TOP_DISTRACTOR_RATE) return null;

    return {
      mostPickedOptionLetter: topLetter,
      mostPickedOptionRate: this.clampPercent(topRate * 100),
      correctOptionLetter,
      correctOptionRate: this.clampPercent(correctRate * 100),
      sampleSize: total,
    };
  }

  /**
   * Produces compact, deterministic evidence about how learners answered a
   * non-single-choice item. This intentionally describes observed patterns;
   * it never labels an answer pattern as cheating or as a wrong answer key.
   */
  private detectAnswerPatterns(
    rows: Array<{ answer: unknown }>,
    questionType: string,
    questionOptions: unknown,
  ): {
    kind: 'FILL_IN_BLANK' | 'ORDERING' | 'MATCHING' | 'TEXT';
    sampleSize: number;
    entries: Array<{ label: string; value: string; rate: number; count: number }>;
  } | null {
    const answered = rows
      .map((row) => this.parseJsonValue(row.answer, row.answer))
      .filter((answer) => answer !== null && typeof answer !== 'undefined');
    const MIN_SAMPLE_SIZE = 5;
    if (answered.length < MIN_SAMPLE_SIZE) return null;

    const topEntries = (values: Array<{ label: string; value: string }>) => {
      const counts = new Map<string, { label: string; value: string; count: number }>();
      for (const entry of values) {
        const normalized = entry.value.replace(/\s+/g, ' ').trim();
        if (!normalized) continue;
        const key = `${entry.label}\u0000${normalized.toLocaleLowerCase('vi-VN')}`;
        const current = counts.get(key);
        if (current) current.count += 1;
        else counts.set(key, { label: entry.label, value: normalized.slice(0, 180), count: 1 });
      }
      return [...counts.values()]
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, 'vi'))
        .slice(0, 3)
        .map((entry) => ({
          ...entry,
          rate: this.clampPercent((entry.count / answered.length) * 100),
        }));
    };

    if (questionType === 'FILL_IN_BLANK') {
      const maxBlanks = Math.max(0, ...answered.map((answer) => Array.isArray(answer) ? answer.length : 0));
      // Keep the most frequent term for each blank, then present at most the
      // first three blanks to keep the review list readable.
      const flattened = Array.from({ length: maxBlanks }, (_, index) =>
        topEntries(answered
          .filter(Array.isArray)
          .map((answer) => ({ label: `Ô trống ${index + 1}`, value: String(answer[index] ?? '') })))
          .slice(0, 1)[0],
      ).filter(Boolean) as Array<{ label: string; value: string; rate: number; count: number }>;
      return flattened.length
        ? { kind: 'FILL_IN_BLANK', sampleSize: answered.length, entries: flattened.slice(0, 3) }
        : null;
    }

    if (questionType === 'ORDERING') {
      const entries = topEntries(answered
        .filter(Array.isArray)
        .map((answer) => ({ label: 'Thứ tự phổ biến', value: answer.map((item) => String(item ?? '').trim()).filter(Boolean).join(' → ') })));
      return entries.length ? { kind: 'ORDERING', sampleSize: answered.length, entries } : null;
    }

    if (questionType === 'MATCHING') {
      const optionValue = this.parseJsonValue(questionOptions, {});
      const left = Array.isArray(optionValue?.left) ? optionValue.left : [];
      const entries = topEntries(answered
        .filter((answer) => answer && typeof answer === 'object' && !Array.isArray(answer))
        .map((answer) => {
          const mapping = Object.entries(answer as Record<string, unknown>)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([key, value]) => `${String(left[Number(key)] ?? `Mục ${Number(key) + 1}`)} → ${String(value ?? '')}`)
            .join('; ');
          return { label: 'Cách ghép phổ biến', value: mapping };
        }));
      return entries.length ? { kind: 'MATCHING', sampleSize: answered.length, entries } : null;
    }

    if (['ESSAY', 'SHORT_ANSWER'].includes(questionType)) {
      const stopWords = new Set(['và', 'là', 'của', 'các', 'cho', 'trong', 'được', 'với', 'một', 'những', 'the', 'and', 'that', 'this']);
      const phrases = answered.flatMap((answer) => {
        const text = typeof answer === 'object' && answer !== null ? String((answer as any).answer ?? '') : String(answer ?? '');
        const words = text.toLocaleLowerCase('vi-VN').match(/[\p{L}\p{N}]{2,}/gu) || [];
        const unique = new Set<string>();
        for (let index = 0; index < words.length - 1; index += 1) {
          if (!stopWords.has(words[index]) && !stopWords.has(words[index + 1])) unique.add(`${words[index]} ${words[index + 1]}`);
        }
        return [...unique].map((value) => ({ label: 'Cụm từ thường gặp', value }));
      });
      const entries = topEntries(phrases).filter((entry) => entry.count >= 2);
      return entries.length ? { kind: 'TEXT', sampleSize: answered.length, entries } : null;
    }

    return null;
  }

  private normalizeScore(rawScore: number, maxRawScore: number): number {
    if (!Number.isFinite(rawScore) || !Number.isFinite(maxRawScore) || maxRawScore <= 0) {
      return 0;
    }
    return Number(Math.max(0, Math.min(10, (rawScore / maxRawScore) * 10)).toFixed(2));
  }

  private mapSnapshotQuestions(snapshotQuestions: any[] = []): SnapshotQuestion[] {
    return snapshotQuestions.map((item) => {
      const payload = this.parseJsonValue(item.payload, {});
      const questionPayload = this.parseJsonValue(item.questionSnapshot?.payload, {});
      const merged = {
        ...payload,
        ...questionPayload,
      };
      const assignedScore = this.toNumber(
        item.assignedScore ?? merged.assignedScore ?? item.points ?? merged.points,
        1,
      );

      return {
        questionId: item.questionId,
        questionVersionId: item.questionVersionId ?? merged.questionVersionId ?? null,
        questionSnapshotId: item.questionSnapshotId ?? item.questionSnapshot?.id ?? null,
        orderIndex: Number(item.orderIndex || 0),
        type: String(merged.type || '').toUpperCase(),
        stem: String(merged.stem || merged.content || ''),
        answerKey:
          typeof merged.answerKey !== 'undefined'
            ? merged.answerKey
            : typeof merged.correctAnswer !== 'undefined'
              ? merged.correctAnswer
              : null,
        explanation: typeof merged.explanation === 'string' ? merged.explanation : null,
        assignedScore,
      };
    });
  }

  async getExamOverview(examId: string, user?: RequestUser) {
    if (user) {
      await this.accessPolicy.assertInstructorCanAccessExam(examId, user);
    }

    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: {
        id: true,
        title: true,
        totalPoints: true,
        status: true,
        startTime: true,
        endTime: true,
        maxAttempts: true,
        settings: true,
      },
    });

    if (!exam) {
      throw new NotFoundException('Không tìm thấy bài thi');
    }

    const [submissions, proctoringSessions, integrityLogs, evidenceRows] = await Promise.all([
      this.prisma.examSubmission.findMany({
        where: { examId },
        select: {
          id: true,
          studentId: true,
          status: true,
          score: true,
          startedAt: true,
          submittedAt: true,
          createdAt: true,
          student: {
            select: {
              id: true,
              fullName: true,
              studentId: true,
            },
          },
          scoreAdjustments: { select: { amount: true, revokedAt: true } },
          integrityReview: { select: { status: true, finalScore: true } },
        },
      }),
      this.prisma.proctoringSession.findMany({
        where: {
          submission: {
            examId,
          },
        },
        select: {
          id: true,
          tabSwitchCount: true,
          mouseAnomalies: true,
          submission: {
            select: {
              id: true,
              attemptNo: true,
              student: {
                select: {
                  id: true,
                  fullName: true,
                  studentId: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.integrityLog.findMany({
        where: {
          proctoring: {
            submission: {
              examId,
            },
          },
        },
        orderBy: { timestamp: 'desc' },
        take: 80,
        select: {
          id: true,
          eventType: true,
          details: true,
          timestamp: true,
          proctoring: {
            select: {
              submission: {
                select: {
                  id: true,
                  attemptNo: true,
                  student: {
                    select: {
                      id: true,
                      fullName: true,
                      studentId: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.proctoringEvidenceCapture.findMany({
        where: {
          submission: { examId },
          status: { in: ['UPLOADED', 'ANALYZING', 'ANALYZED'] },
        },
        select: { submissionId: true, triggerDetails: true },
      }),
    ]);

    // The tab_switch/mouse_idle alerts below are synthesized from running
    // counters (ProctoringSession.tabSwitchCount/mouseAnomalies), not from a
    // single discrete log row, so they have no natural "timestamp" of their
    // own. Using `new Date()` (this poll's server time) made them re-sort to
    // the top of the lecturer's alert feed on every 10s refresh regardless of
    // whether a new violation actually happened — this recovers the real
    // last-occurrence time per session from the underlying log rows instead.
    const lastEventAtByProctoringAndType = new Map<string, Date>();
    const lastEventGroups = await this.prisma.integrityLog.groupBy({
      by: ['proctoringId', 'eventType'],
      where: {
        proctoring: { submission: { examId } },
        eventType: { in: ['tab_switch', 'mouse_idle', 'mouse_anomaly'] },
      },
      _max: { timestamp: true },
    });
    for (const group of lastEventGroups) {
      if (!group._max.timestamp) continue;
      const key = `${group.proctoringId}:${group.eventType.toLowerCase()}`;
      const existing = lastEventAtByProctoringAndType.get(key);
      if (!existing || group._max.timestamp > existing) {
        lastEventAtByProctoringAndType.set(key, group._max.timestamp);
      }
    }

    const hasEvidenceForEvent = (submissionId: string | null | undefined, eventType: string) => evidenceRows.some((row) => {
      if (!submissionId || row.submissionId !== submissionId) return false;
      const details = this.parseJsonValue(row.triggerDetails, {});
      const signals = Array.isArray(details?.signals) ? details.signals : [];
      return signals.includes(eventType);
    });

    const isUnlimited = this.isUnlimitedAttemptsExam(exam);
    const completed = isUnlimited
      ? this.collapseLatestCompletedSubmissions(
          submissions.filter((s) => ['SUBMITTED', 'GRADED', 'FLAGGED'].includes(s.status)),
        )
      : submissions.filter((s) => ['SUBMITTED', 'GRADED', 'FLAGGED'].includes(s.status));
    // Same reasoning as sanitizeStudentSubmissionView's `adjustedScore`: a
    // confirmed integrity penalty's finalScore is the true official score,
    // and non-revoked scoreAdjustments are part of the official grade too —
    // averaging raw `score` here would silently ignore both.
    const effectiveScore = (s: (typeof submissions)[number]) => {
      if (String(s.integrityReview?.status || '').toUpperCase() === 'CONFIRMED' && s.integrityReview?.finalScore != null) {
        return this.toNumber(s.integrityReview.finalScore);
      }
      const adjustmentTotal = (s.scoreAdjustments || [])
        .filter((a) => !a.revokedAt)
        .reduce((sum, a) => sum + this.toNumber(a.amount), 0);
      return Number(Math.max(0, Math.min(10, this.toNumber(s.score) + adjustmentTotal)).toFixed(2));
    };
    const scoresPct = completed
      .filter((s) => s.score !== null && s.score !== undefined)
      .map((s) => this.clampPercent(effectiveScore(s) * 10));

    // Bin boundaries stay in the 0-100 domain scoresPct is computed in below —
    // only the label is point-scale (0-10) text, since that's the unit the
    // lecturer-facing chart displays.
    const bins = [
      { key: '0-2', min: 0, max: 20, count: 0 },
      { key: '2-4', min: 21, max: 40, count: 0 },
      { key: '4-6', min: 41, max: 60, count: 0 },
      { key: '6-8', min: 61, max: 80, count: 0 },
      { key: '8-10', min: 81, max: 100, count: 0 },
    ];

    for (const value of scoresPct) {
      const rounded = Math.round(value);
      const bucket = bins.find((b) => rounded >= b.min && rounded <= b.max);
      if (bucket) bucket.count += 1;
    }

    const suspiciousTypes = new Set([
      'tab_switch',
      'mouse_anomaly',
      'mouse_idle',
      'copy',
      'paste',
      'fullscreen_exit',
      'window_blur',
      'face_not_detected',
      'camera_stream_ended',
      'camera_recovery_timeout',
      'multi_monitor_detected',
      'multi_monitor_at_start',
    ]);

    const mappedLogs = integrityLogs
      .filter((log) => suspiciousTypes.has((log.eventType || '').toLowerCase()))
      .map((log) => {
        const event = (log.eventType || 'unknown').toLowerCase();
        const severity = this.getRealtimeSeverity(event);

        return {
          id: log.id,
          eventType: log.eventType,
          // Same short label used by ExamMonitor.tsx's alert feed and the
          // case-detail timeline — `details` stays as the raw, event-
          // specific description text for secondary/supporting context.
          label: getIntegrityEventLabel(event),
          details: log.details || '',
          timestamp: log.timestamp,
          severity,
          attemptNo: log.proctoring?.submission?.attemptNo ?? null,
          student: log.proctoring?.submission?.student || null,
          submissionId: log.proctoring?.submission?.id || null,
          hasEvidence: hasEvidenceForEvent(log.proctoring?.submission?.id, event),
        };
      });

    const syntheticLogs = proctoringSessions.flatMap((p) => {
      const records: any[] = [];
      const tabSwitchCount = Number(p.tabSwitchCount || 0);
      const mouseAnomalies = Number(p.mouseAnomalies || 0);

      if (tabSwitchCount > 0) {
        records.push({
          id: `tab-${p.id}`,
          eventType: 'tab_switch',
          label: getIntegrityEventLabel('tab_switch'),
          details: `Đã ghi nhận ${tabSwitchCount} lần chuyển tab`,
          timestamp: lastEventAtByProctoringAndType.get(`${p.id}:tab_switch`) ?? new Date(),
          severity: tabSwitchCount >= 5 ? 'high' : 'medium',
          attemptNo: p.submission.attemptNo ?? null,
          student: p.submission.student,
          submissionId: p.submission.id,
          hasEvidence: hasEvidenceForEvent(p.submission.id, 'tab_switch'),
        });
      }

      if (mouseAnomalies > 0) {
        // Same fix as elsewhere in this file: the client only ever emits
        // `mouse_idle`, never `mouse_anomaly` — tag this alert with the real
        // eventType so its label/hasEvidence lookup matches the underlying
        // event instead of a type that's never actually produced.
        records.push({
          id: `mouse-${p.id}`,
          eventType: 'mouse_idle',
          label: getIntegrityEventLabel('mouse_idle'),
          details: `Đã ghi nhận ${mouseAnomalies} lần gián đoạn tương tác chuột/bàn phím`,
          timestamp: lastEventAtByProctoringAndType.get(`${p.id}:mouse_idle`)
            ?? lastEventAtByProctoringAndType.get(`${p.id}:mouse_anomaly`)
            ?? new Date(),
          severity: mouseAnomalies >= 8 ? 'high' : 'medium',
          attemptNo: p.submission.attemptNo ?? null,
          student: p.submission.student,
          submissionId: p.submission.id,
          hasEvidence: hasEvidenceForEvent(p.submission.id, 'mouse_idle'),
        });
      }

      return records;
    });

    const anomalies = [...mappedLogs, ...syntheticLogs]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 25);

    return {
      exam,
      analyticsScope: isUnlimited ? 'PRACTICE' : 'OFFICIAL',
      isUnlimited,
      summary: {
        totalSubmissions: submissions.length,
        inProgress: submissions.filter((s) => s.status === 'IN_PROGRESS').length,
        completed: completed.length,
        avgScorePct: scoresPct.length ? Number((scoresPct.reduce((a, b) => a + b, 0) / scoresPct.length).toFixed(1)) : 0,
        highestScorePct: scoresPct.length ? Number(Math.max(...scoresPct).toFixed(1)) : 0,
        lowestScorePct: scoresPct.length ? Number(Math.min(...scoresPct).toFixed(1)) : 0,
      },
      scoreDistribution: bins,
      anomalies,
      updatedAt: new Date().toISOString(),
    };
  }

  async getExamIntelligence(
    examId: string,
    user?: RequestUser,
    options?: { attemptScope?: string },
  ) {
    if (user) {
      await this.accessPolicy.assertInstructorCanAccessExam(examId, user);
    }

    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: {
        id: true,
        title: true,
        courseId: true,
        passingScore: true,
        totalPoints: true,
        maxAttempts: true,
        gradingStrategy: true,
        settings: true,
        duration: true,
        timeLimitMinutes: true,
      },
    });

    if (!exam) {
      throw new NotFoundException('Không tìm thấy bài thi');
    }

    const [examQuestionRows, submissions, integrityLogs] = await Promise.all([
      this.prisma.examQuestion.findMany({
        where: { examId },
        orderBy: { orderIndex: 'asc' },
        select: {
          questionId: true,
          questionVersionId: true,
          orderIndex: true,
          question: {
            select: {
              type: true,
              content: true,
              updatedAt: true,
              correctAnswer: true,
              options: true,
            },
          },
          questionVersion: {
            select: {
              stem: true,
              answerKey: true,
            },
          },
        },
      }),
      this.prisma.examSubmission.findMany({
        where: { examId },
        select: {
          id: true,
          studentId: true,
          attemptNo: true,
          status: true,
          score: true,
          startedAt: true,
          submittedAt: true,
          createdAt: true,
          student: {
            select: {
              id: true,
              fullName: true,
              studentId: true,
            },
          },
          scoreAdjustments: { select: { amount: true, revokedAt: true } },
          integrityReview: { select: { status: true, finalScore: true } },
        },
      }),
      this.prisma.integrityLog.findMany({
        where: {
          proctoring: {
            submission: {
              examId,
            },
          },
        },
        select: {
          eventType: true,
          details: true,
        },
      }),
    ]);

    // Same reasoning as sanitizeStudentSubmissionView's `adjustedScore` /
    // getExamOverview's effectiveScore: a confirmed integrity penalty's
    // finalScore is the true official score, and non-revoked scoreAdjustments
    // are part of the official grade too. Every analytics stat below (avg,
    // highest/lowest, per-attempt breakdown, first-vs-retake comparison,
    // score-over-time) is derived from this, on the 0-10 scale.
    const effectiveScoreOnTen = (s: (typeof submissions)[number]) => {
      if (String(s.integrityReview?.status || '').toUpperCase() === 'CONFIRMED' && s.integrityReview?.finalScore != null) {
        return this.toNumber(s.integrityReview.finalScore);
      }
      const adjustmentTotal = (s.scoreAdjustments || [])
        .filter((a) => !a.revokedAt)
        .reduce((sum, a) => sum + this.toNumber(a.amount), 0);
      return Number(Math.max(0, Math.min(10, this.toNumber(s.score) + adjustmentTotal)).toFixed(2));
    };

    const examQuestions = examQuestionRows.map((item) => ({
      questionId: item.questionId,
      questionVersionId: item.questionVersionId,
      orderIndex: item.orderIndex,
      questionType: item.question?.type || 'UNKNOWN',
      questionContent: item.questionVersion?.stem || item.question?.content || '',
      questionUpdatedAt: item.question?.updatedAt || null,
      questionOptions: item.question?.options ?? null,
      // Read the key straight from the source of truth, never inferred from
      // student answers — if every single student answered "wrong", inferring
      // the key from (rare/zero) correct rows would silently miss exactly the
      // mis-keyed-answer case this is meant to catch.
      correctOptionLetter: this.extractSingleAnswerLetter(
        item.questionVersion?.answerKey ?? item.question?.correctAnswer,
      ),
    }));

    const topicByQuestionId = new Map<string, { topicId: string; topicName: string }>();
    try {
      const topicRows = await this.prisma.$queryRaw<Array<{
        questionId: string;
        topicId: string;
        topicName: string;
      }>>`
        SELECT qt.questionId, t.id AS topicId, t.name AS topicName
        FROM question_topics qt
        INNER JOIN topics t ON t.id = qt.topicId
        WHERE qt.questionId IN (
          SELECT eq.questionId FROM exam_questions eq WHERE eq.examId = ${examId}
        )
      `;

      for (const row of topicRows) {
        if (!topicByQuestionId.has(row.questionId)) {
          topicByQuestionId.set(row.questionId, { topicId: row.topicId, topicName: row.topicName });
        }
      }
    } catch {
      // Legacy databases may not have question_topics/topics in expected shape.
    }

    const configuredMaxAttempts = this.resolveConfiguredMaxAttempts(exam);
    const isUnlimited = configuredMaxAttempts === null;
    const allowsMultipleAttempts = isUnlimited || (configuredMaxAttempts !== null && configuredMaxAttempts > 1);

    const allCompletedSubmissions = submissions.filter((s) =>
      ['SUBMITTED', 'GRADED', 'FLAGGED'].includes(String(s.status).toUpperCase()),
    );

    // Group submissions by student to calculate multi-attempt progression statistics
    const studentSubmissionsMap = new Map<string, typeof submissions>();
    for (const sub of allCompletedSubmissions) {
      const sKey = sub.studentId || sub.id;
      const list = studentSubmissionsMap.get(sKey) || [];
      list.push(sub);
      studentSubmissionsMap.set(sKey, list);
    }

    const totalUniqueStudents = studentSubmissionsMap.size;
    let studentsWithRetakes = 0;
    let totalScoreImprovementSum = 0;
    let retakeStudentCount = 0;

    const firstAttemptSubmissions: typeof submissions = [];
    const retakeSubmissions: typeof submissions = [];
    const attemptBuckets = new Map<number, typeof submissions>();

    for (const [, studentSubs] of studentSubmissionsMap.entries()) {
      studentSubs.sort((a, b) => (a.attemptNo ?? 1) - (b.attemptNo ?? 1));
      if (studentSubs.length > 1) {
        studentsWithRetakes += 1;
        const firstScore = studentSubs[0] ? effectiveScoreOnTen(studentSubs[0]) * 10 : 0;
        const bestRetakeScore = Math.max(...studentSubs.slice(1).map((s) => effectiveScoreOnTen(s) * 10));
        const diff = bestRetakeScore - firstScore;
        totalScoreImprovementSum += diff;
        retakeStudentCount += 1;
      }
      for (const sub of studentSubs) {
        const attNo = sub.attemptNo ?? 1;
        if (attNo === 1) {
          firstAttemptSubmissions.push(sub);
        } else {
          retakeSubmissions.push(sub);
        }
        const b = attemptBuckets.get(attNo) || [];
        b.push(sub);
        attemptBuckets.set(attNo, b);
      }
    }

    const rawPassingScore = Number(exam.passingScore ?? 50);
    // Normalize passing threshold to 0-100 percentage scale:
    // If rawPassingScore > 10 (e.g. 50 meaning 50%), threshold is 50.
    // If rawPassingScore <= 10 (e.g. 5.0 meaning 5/10), threshold is 50.
    const passingScorePct = rawPassingScore > 10 ? rawPassingScore : rawPassingScore * 10;

    const attemptBreakdown = Array.from(attemptBuckets.entries())
      .map(([attemptNo, subs]) => {
        const avgScorePct = subs.length
          ? Number((subs.reduce((acc, s) => acc + effectiveScoreOnTen(s) * 10, 0) / subs.length).toFixed(1))
          : 0;
        const passRate = subs.length
          ? this.clampPercent((subs.filter((s) => effectiveScoreOnTen(s) * 10 >= passingScorePct).length / subs.length) * 100)
          : 0;
        return {
          attemptNo,
          submissionCount: subs.length,
          avgScorePct,
          passRate,
        };
      })
      .sort((a, b) => a.attemptNo - b.attemptNo);

    const avgAttemptsPerStudent = totalUniqueStudents > 0 ? allCompletedSubmissions.length / totalUniqueStudents : 1;
    const firstAttemptAvgScore = firstAttemptSubmissions.length
      ? firstAttemptSubmissions.reduce((sum, s) => sum + effectiveScoreOnTen(s) * 10, 0) / firstAttemptSubmissions.length
      : 0;
    const firstAttemptPassRate = firstAttemptSubmissions.length
      ? this.clampPercent((firstAttemptSubmissions.filter((s) => effectiveScoreOnTen(s) * 10 >= passingScorePct).length / firstAttemptSubmissions.length) * 100)
      : 0;
    const retakeAvgScore = retakeSubmissions.length
      ? retakeSubmissions.reduce((sum, s) => sum + effectiveScoreOnTen(s) * 10, 0) / retakeSubmissions.length
      : 0;
    const retakePassRate = retakeSubmissions.length
      ? this.clampPercent((retakeSubmissions.filter((s) => effectiveScoreOnTen(s) * 10 >= passingScorePct).length / retakeSubmissions.length) * 100)
      : 0;
    const avgScoreImprovement = retakeStudentCount > 0 ? totalScoreImprovementSum / retakeStudentCount : null;

    const attemptStats = {
      maxAttempts: configuredMaxAttempts,
      allowsMultipleAttempts,
      isUnlimited,
      totalUniqueStudents,
      studentsWithRetakes,
      retakeRate: this.clampPercent((studentsWithRetakes / Math.max(1, totalUniqueStudents)) * 100),
      avgAttemptsPerStudent: Number(avgAttemptsPerStudent.toFixed(1)),
      firstAttemptAvgScore: Number(firstAttemptAvgScore.toFixed(1)),
      firstAttemptPassRate: Number(firstAttemptPassRate.toFixed(1)),
      retakeAttemptsAvgScore: retakeSubmissions.length ? Number(retakeAvgScore.toFixed(1)) : null,
      retakeAttemptsPassRate: retakeSubmissions.length ? Number(retakePassRate.toFixed(1)) : null,
      avgScoreImprovement: avgScoreImprovement !== null ? Number(avgScoreImprovement.toFixed(1)) : null,
      attemptBreakdown,
    };

    const rawGradingStrategy = (
      exam.gradingStrategy ??
      (exam.settings as any)?.gradingStrategy ??
      'HIGHEST'
    ).toString().toUpperCase();

    const officialScope =
      rawGradingStrategy === 'FIRST_ATTEMPT'
        ? 'first'
        : rawGradingStrategy === 'LAST_ATTEMPT'
          ? 'latest'
          : rawGradingStrategy === 'AVERAGE'
            ? 'all'
            : 'best'; // HIGHEST

    // Filter scopedCompletedSubmissions according to attemptScope parameter or default to officialScope
    const requestedScope = String(options?.attemptScope || officialScope).toLowerCase();
    let scopedCompletedSubmissions: typeof submissions;
    let effectiveAttemptScope = officialScope;

    if (allowsMultipleAttempts && requestedScope === 'first') {
      scopedCompletedSubmissions = firstAttemptSubmissions;
      effectiveAttemptScope = 'first';
    } else if (allowsMultipleAttempts && requestedScope === 'retakes') {
      scopedCompletedSubmissions = retakeSubmissions.length > 0 ? retakeSubmissions : allCompletedSubmissions;
      effectiveAttemptScope = 'retakes';
    } else if (allowsMultipleAttempts && requestedScope === 'best') {
      const bestMap = new Map<string, (typeof submissions)[0]>();
      for (const sub of allCompletedSubmissions) {
        const key = sub.studentId || sub.id;
        const cur = bestMap.get(key);
        if (!cur || effectiveScoreOnTen(sub) > effectiveScoreOnTen(cur)) {
          bestMap.set(key, sub);
        }
      }
      scopedCompletedSubmissions = Array.from(bestMap.values());
      effectiveAttemptScope = 'best';
    } else if (allowsMultipleAttempts && requestedScope === 'latest') {
      scopedCompletedSubmissions = this.collapseLatestCompletedSubmissions(allCompletedSubmissions);
      effectiveAttemptScope = 'latest';
    } else {
      scopedCompletedSubmissions = allCompletedSubmissions;
      effectiveAttemptScope = 'all';
    }

    const completedSubmissionIds = scopedCompletedSubmissions.map((s) => s.id);

    const completionDurations = scopedCompletedSubmissions
      .map((submission) => {
        if (!submission.startedAt || !submission.submittedAt) return null;
        const elapsed = new Date(submission.submittedAt).getTime() - new Date(submission.startedAt).getTime();
        return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed / 60_000 : null;
      })
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    const cohortMedianMinutes = completionDurations.length
      ? Number((completionDurations[Math.floor(completionDurations.length / 2)]).toFixed(1))
      : null;
    const fastCompletions = scopedCompletedSubmissions
      .map((submission) => {
        const signal = this.getFastCompletionSignal({
          startedAt: submission.startedAt,
          submittedAt: submission.submittedAt,
          score: submission.score,
          exam,
        });
        if (!signal) return null;
        return {
          submissionId: submission.id,
          studentId: submission.studentId,
          studentName: submission.student?.fullName || 'Sinh viên không xác định',
          studentCode: submission.student?.studentId || null,
          cohortMedianMinutes,
          ...signal,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .sort((a, b) => {
        if (a.severity !== b.severity) return a.severity === 'HIGH' ? -1 : 1;
        return a.completionRatio - b.completionRatio;
      });

    const answers = completedSubmissionIds.length
      ? await this.prisma.submissionAnswer.findMany({
          where: { submissionId: { in: completedSubmissionIds } },
          select: {
            submissionId: true,
            questionId: true,
            questionVersionId: true,
            questionSnapshotId: true,
            isCorrect: true,
            timeTaken: true,
            answer: true,
          },
        })
      : [];
    const studentsBySubmissionId = new Map<string, { studentId: string; studentName: string; studentCode: string | null }>(
      scopedCompletedSubmissions.map((submission) => [
        submission.id,
        {
          studentId: submission.studentId,
          studentName: submission.student?.fullName || 'Sinh viên không xác định',
          studentCode: submission.student?.studentId || null,
        },
      ]),
    );
    const orderIndexByQuestionVersionId = new Map<string, number>(
      examQuestions
        .filter((question) => Boolean(question.questionVersionId))
        .map((question) => [question.questionVersionId as string, question.orderIndex]),
    );
    const similarAnswerPairs = this.buildSimilarAnswerPairs({
      answers,
      studentsBySubmissionId,
      orderIndexByQuestionVersionId,
    });

    type QuestionStatsRow = {
      questionVersionId: string;
      pValue: { toNumber(): number } | null;
      difficultyIndex: { toNumber(): number } | null;
      discriminationIndex: { toNumber(): number } | null;
      totalAttempts: number;
      correctAttempts: number;
      incorrectAttempts: number;
      skippedAttempts: number;
    };

    const questionVersionIds = examQuestions
      .map((eq) => eq.questionVersionId)
      .filter((id): id is string => Boolean(id));

    const statsRows: QuestionStatsRow[] = questionVersionIds.length
      ? await this.prisma.questionStatistics.findMany({
          where: {
            questionVersionId: {
              in: questionVersionIds,
            },
          },
          select: {
            questionVersionId: true,
            pValue: true,
            difficultyIndex: true,
            discriminationIndex: true,
            totalAttempts: true,
            correctAttempts: true,
            incorrectAttempts: true,
            skippedAttempts: true,
          },
        })
      : [];
    const statsByVersionId = new Map(statsRows.map((row) => [row.questionVersionId, row]));

    const attemptsPerQuestion = Math.max(1, scopedCompletedSubmissions.length);
    const byQuestion = new Map<string, Array<{ isCorrect: boolean; timeTaken: number | null; selectedLetter: string | null; answer: unknown }>>();
    for (const row of answers) {
      const key = row.questionVersionId || row.questionId;
      const list = byQuestion.get(key) || [];
      list.push({
        isCorrect: Boolean(row.isCorrect),
        timeTaken: row.timeTaken ?? null,
        selectedLetter: this.extractSingleAnswerLetter(row.answer),
        answer: row.answer,
      });
      byQuestion.set(key, list);
    }

    const flaggedByQuestion = new Map<string, number>();
    for (const log of integrityLogs) {
      const eventType = String(log.eventType || '').toLowerCase();
      if (!eventType.includes('flag')) continue;
      const parsed = this.parseLogDetails(log.details);
      const questionId = parsed?.questionId ? String(parsed.questionId) : null;
      if (!questionId) continue;
      flaggedByQuestion.set(questionId, (flaggedByQuestion.get(questionId) || 0) + 1);
    }

    const aiImprovementRecords = await this.prisma.aIGenerationRecord.findMany({
      where: {
        examId,
        section: 'QUALITY_REVIEW',
      },
      select: {
        id: true,
        status: true,
        reviewStatus: true,
        errorMessage: true,
        prompt: true,
        createdAt: true,
        completedAt: true,
        reviewedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const aiImprovementByQuestion = new Map<string, {
      id: string;
      status: string;
      rawStatus: string;
      reviewStatus: string;
      completedAt: Date | null;
      reviewedAt: Date | null;
      errorMessage: string | null;
      sourceUpdatedAt: string | null;
    }>();

    for (const record of aiImprovementRecords) {
      const payload = this.parseJsonValue(record.prompt as any, {})?.payload || {};
      if (payload.task !== 'question-improvement' || !payload.questionId) continue;
      const questionId = String(payload.questionId);
      if (aiImprovementByQuestion.has(questionId)) continue;

      let status = 'IDLE';
      if (record.reviewStatus === 'APPROVED') status = 'APPROVED';
      else if (record.reviewStatus === 'REJECTED') status = 'REJECTED';
      else if (record.status === 'QUEUED') status = 'QUEUED';
      else if (record.status === 'RUNNING') status = 'GENERATING';
      else if (record.status === 'FAILED') status = 'FAILED';
      else if (record.status === 'SUCCEEDED') status = 'READY_FOR_REVIEW';

      aiImprovementByQuestion.set(questionId, {
        id: record.id,
        status,
        rawStatus: record.status,
        reviewStatus: record.reviewStatus,
        completedAt: record.completedAt,
        reviewedAt: record.reviewedAt,
        errorMessage: record.status === 'FAILED' ? record.errorMessage : null,
        sourceUpdatedAt: payload.sourceUpdatedAt || null,
      });
    }

    const questionMetrics = examQuestions.map((eq) => {
      const metricKey = eq.questionVersionId || eq.questionId;
      const rows = byQuestion.get(metricKey) || [];
      const answeredCount = rows.length;
      const correctCount = rows.filter((r) => r.isCorrect).length;
      const incorrectCount = Math.max(0, answeredCount - correctCount);
      const skippedCount = Math.max(0, attemptsPerQuestion - answeredCount);
      const avgTimeSeconds = rows.length
        ? Number((rows.reduce((sum, r) => sum + Number(r.timeTaken || 0), 0) / rows.length).toFixed(1))
        : 0;
      const topic = topicByQuestionId.get(eq.questionId);
      const stats = eq.questionVersionId ? statsByVersionId.get(eq.questionVersionId) : null;
      const aiImprovement = aiImprovementByQuestion.get(eq.questionId) || null;
      const keyErrorSignal = this.detectPossibleKeyError(rows, eq.correctOptionLetter);
      const answerPattern = this.detectAnswerPatterns(rows, eq.questionType, eq.questionOptions);
      if (
        aiImprovement?.status === 'READY_FOR_REVIEW'
        && aiImprovement.sourceUpdatedAt
        && eq.questionUpdatedAt
        && new Date(eq.questionUpdatedAt).getTime() > new Date(aiImprovement.sourceUpdatedAt).getTime() + 1000
      ) {
        aiImprovement.status = 'EXPIRED';
      }
      return {
        questionId: eq.questionId,
        questionVersionId: eq.questionVersionId || null,
        orderIndex: eq.orderIndex,
        questionType: eq.questionType,
        topicId: topic?.topicId || null,
        topicName: topic?.topicName || 'Untagged',
        questionText: String(eq.questionContent || '').slice(0, 180),
        incorrectRate: this.clampPercent((incorrectCount / attemptsPerQuestion) * 100),
        skipRate: this.clampPercent((skippedCount / attemptsPerQuestion) * 100),
        avgTimeSeconds,
        flaggedCount: flaggedByQuestion.get(eq.questionId) || 0,
        aiImprovement,
        correctCount,
        incorrectCount,
        skippedCount,
        pValue: stats?.pValue !== undefined && stats?.pValue !== null ? Number(stats.pValue) : null,
        difficultyIndex: stats?.difficultyIndex !== undefined && stats?.difficultyIndex !== null ? Number(stats.difficultyIndex) : null,
        discriminationIndex: stats?.discriminationIndex !== undefined && stats?.discriminationIndex !== null ? Number(stats.discriminationIndex) : null,
        possibleKeyError: keyErrorSignal,
        answerPattern,
        action: {
          path: '/lecturer/question-bank',
          params: {
            courseId: exam.courseId,
            questionId: eq.questionId,
            topicId: topic?.topicId || undefined,
            type: eq.questionType,
          },
        },
      };
    });

    const topicRollup = new Map<string, { topicId: string | null; topicName: string; incorrect: number; skipped: number; denominator: number }>();
    const typeRollup = new Map<string, { type: string; incorrect: number; skipped: number; denominator: number; timeTotal: number; count: number }>();

    for (const q of questionMetrics) {
      const topicKey = q.topicId || q.topicName;
      const t = topicRollup.get(topicKey) || {
        topicId: q.topicId,
        topicName: q.topicName,
        incorrect: 0,
        skipped: 0,
        denominator: 0,
      };
      t.incorrect += q.incorrectCount;
      t.skipped += q.skippedCount;
      t.denominator += attemptsPerQuestion;
      topicRollup.set(topicKey, t);

      const type = typeRollup.get(q.questionType) || {
        type: q.questionType,
        incorrect: 0,
        skipped: 0,
        denominator: 0,
        timeTotal: 0,
        count: 0,
      };
      type.incorrect += q.incorrectCount;
      type.skipped += q.skippedCount;
      type.denominator += attemptsPerQuestion;
      type.timeTotal += q.avgTimeSeconds;
      type.count += 1;
      typeRollup.set(q.questionType, type);
    }

    const weakestTopics = Array.from(topicRollup.values())
      .map((t) => ({
        topicId: t.topicId,
        topicName: t.topicName,
        incorrectRate: this.clampPercent((t.incorrect / Math.max(1, t.denominator)) * 100),
        skipRate: this.clampPercent((t.skipped / Math.max(1, t.denominator)) * 100),
        action: {
          path: '/lecturer/question-bank',
          params: { courseId: exam.courseId, topicId: t.topicId || undefined },
        },
      }))
      .sort((a, b) => b.incorrectRate - a.incorrectRate)
      .slice(0, 8);

    const slowestQuestionTypes = Array.from(typeRollup.values())
      .map((t) => ({
        type: t.type,
        avgTimeSeconds: Number((t.timeTotal / Math.max(1, t.count)).toFixed(1)),
        incorrectRate: this.clampPercent((t.incorrect / Math.max(1, t.denominator)) * 100),
        skipRate: this.clampPercent((t.skipped / Math.max(1, t.denominator)) * 100),
        action: {
          path: '/lecturer/question-bank',
          params: { courseId: exam.courseId, type: t.type },
        },
      }))
      .sort((a, b) => b.avgTimeSeconds - a.avgTimeSeconds);

    const mostIncorrectLimit = Math.min(8, Math.max(5, Math.round(questionMetrics.length * 0.2)));
    const mostIncorrectQuestions = [...questionMetrics]
      .sort((a, b) => {
        // A likely mis-keyed answer is the single most actionable finding
        // this report can surface — it points at a lecturer error, not just
        // "students struggled" — so it outranks raw incorrect-rate ordering.
        const keyErrorDelta = Number(Boolean(b.possibleKeyError)) - Number(Boolean(a.possibleKeyError));
        if (keyErrorDelta !== 0) return keyErrorDelta;
        const incorrectDelta = b.incorrectRate - a.incorrectRate;
        if (incorrectDelta !== 0) return incorrectDelta;
        const skipDelta = b.skipRate - a.skipRate;
        if (skipDelta !== 0) return skipDelta;
        return b.flaggedCount - a.flaggedCount;
      })
      .slice(0, mostIncorrectLimit);
    const mostFlaggedQuestions = [...questionMetrics]
      .filter((q) => q.flaggedCount > 0)
      .sort((a, b) => b.flaggedCount - a.flaggedCount)
      .slice(0, 10);
    const abnormalSkips = [...questionMetrics]
      .filter((q) => q.skipRate >= 40)
      .sort((a, b) => b.skipRate - a.skipRate)
      .slice(0, 10);

    const scoreRows = scopedCompletedSubmissions.map((s) => ({
      date: new Date(s.submittedAt || s.createdAt).toISOString().slice(0, 10),
      scorePct: this.clampPercent(effectiveScoreOnTen(s) * 10),
    }));

    const trendMap = new Map<string, { total: number; count: number }>();
    for (const row of scoreRows) {
      const prev = trendMap.get(row.date) || { total: 0, count: 0 };
      prev.total += row.scorePct;
      prev.count += 1;
      trendMap.set(row.date, prev);
    }
    const trendSeries = Array.from(trendMap.entries())
      .map(([date, v]) => ({ date, avgScorePct: Number((v.total / Math.max(1, v.count)).toFixed(1)) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const avgScorePct = scoreRows.length
      ? Number((scoreRows.reduce((sum, r) => sum + r.scorePct, 0) / scoreRows.length).toFixed(1))
      : 0;
    const passRate = this.clampPercent(
      (scoreRows.filter((r) => r.scorePct >= passingScorePct).length / Math.max(1, scoreRows.length)) * 100,
    );

    const weakestTopic = weakestTopics[0];
    const slowestType = slowestQuestionTypes[0];
    const aiSummary = `Hi\u1ec7u su\u1ea5t t\u1ed1t nh\u1ea5t \u1edf c\u00e1c c\u00e2u h\u1ecfi c\u01a1 b\u1ea3n, nh\u01b0ng \u0111i\u1ec3m y\u1ebfu t\u1eadp trung \u1edf ${weakestTopic ? `${weakestTopic.topicName} (${weakestTopic.incorrectRate.toFixed(0)}% sai)` : 'nhi\u1ec1u ch\u1ee7 \u0111\u1ec1'}. \u00c1p l\u1ef1c th\u1eddi gian cao nh\u1ea5t \u1edf ${slowestType ? `${slowestType.type} (${slowestType.avgTimeSeconds}s trung b\u00ecnh)` : 'c\u00e1c c\u00e2u h\u1ecfi t\u1ef1 lu\u1eadn'}. N\u00ean \u01b0u ti\u00ean luy\u1ec7n t\u1eadp c\u00f3 gi\u1edbi h\u1ea1n th\u1eddi gian tr\u01b0\u1edbc b\u00e0i ki\u1ec3m tra \u0111\u1ea7y \u0111\u1ee7 ti\u1ebfp theo.`;

    const aiRecommendations = [
      {
        title: 'Luy\u1ec7n t\u1eadp l\u1ea1i ch\u1ee7 \u0111\u1ec1 y\u1ebfu',
        detail: weakestTopic
          ? `T\u1ea1o b\u1ed9 luy\u1ec7n t\u1eadp t\u1eadp trung v\u00e0o ${weakestTopic.topicName} v\u1edbi \u0111\u1ed9 kh\u00f3 trung b\u00ecnh v\u00e0 gi\u1edbi h\u1ea1n th\u1eddi gian.`
          : 'T\u1ea1o b\u1ed9 luy\u1ec7n t\u1eadp cho nh\u00f3m ch\u1ee7 \u0111\u1ec1 c\u00f3 hi\u1ec7u su\u1ea5t th\u1ea5p nh\u1ea5t.',
        action: weakestTopic?.action || { path: '/lecturer/question-bank', params: { courseId: exam.courseId } },
      },
      {
        title: 'Gi\u1ea3m l\u1ed7i do \u00e1p l\u1ef1c th\u1eddi gian',
        detail: slowestType
          ? `Ng\u01b0\u1eddi h\u1ecdc m\u1ea5t nhi\u1ec1u th\u1eddi gian \u1edf d\u1ea1ng ${slowestType.type}. Th\u00eam b\u1ed9 luy\u1ec7n t\u1eadp ng\u1eafn 5-8 c\u00e2u c\u00f3 gi\u1edbi h\u1ea1n th\u1eddi gian tr\u01b0\u1edbc b\u00e0i thi \u0111\u1ea7y \u0111\u1ee7.`
          : 'Th\u00eam b\u1ed9 luy\u1ec7n t\u1eadp ng\u1eafn c\u00f3 gi\u1edbi h\u1ea1n th\u1eddi gian cho c\u00e1c d\u1ea1ng c\u00e2u h\u1ecfi m\u1ea5t nhi\u1ec1u th\u1eddi gian.',
        action: slowestType?.action || { path: '/lecturer/question-bank', params: { courseId: exam.courseId } },
      },
    ];

    const creatorQualityAlerts = questionMetrics
      .filter((q) => q.incorrectRate >= 75 || q.skipRate >= 50 || q.flaggedCount >= 3)
      .sort((a, b) => {
        const severityA = (a.incorrectRate * 0.6) + (a.skipRate * 0.25) + (a.flaggedCount * 8);
        const severityB = (b.incorrectRate * 0.6) + (b.skipRate * 0.25) + (b.flaggedCount * 8);
        return severityB - severityA;
      })
      .slice(0, 5)
      .map((q) => ({
        questionId: q.questionId,
        questionLabel: `C\u00e2u ${q.orderIndex + 1}`,
        signal: `${q.incorrectRate.toFixed(0)}% sai \u00b7 ${q.skipRate.toFixed(0)}% b\u1ecf qua \u00b7 ${q.flaggedCount} c\u1ea3nh b\u00e1o`,
        suggestion: 'C\u00f3 d\u1ea5u hi\u1ec7u c\u00e2u h\u1ecfi d\u1ec5 g\u00e2y nh\u1ea7m l\u1eabn. H\u00e3y r\u00e0 so\u00e1t c\u00e1ch di\u1ec5n \u0111\u1ea1t, ph\u01b0\u01a1ng \u00e1n nhi\u1ec5u v\u00e0 m\u1ee9c \u0111\u1ed9 kh\u00f3.',
        action: q.action,
      }));

    return {
      exam: {
        ...exam,
        passingScore: rawPassingScore,
        passingScorePct,
        gradingStrategy: rawGradingStrategy,
      },
      gradingStrategy: rawGradingStrategy,
      passingScorePct,
      analyticsScope: isUnlimited ? 'PRACTICE' : 'OFFICIAL',
      isUnlimited,
      allowsMultipleAttempts,
      attemptScope: effectiveAttemptScope,
      attemptStats,
      kpis: {
        totalSubmissions: submissions.length,
        analyzedSubmissions: scopedCompletedSubmissions.length,
        completedSubmissions: scopedCompletedSubmissions.length,
        completionRate: this.clampPercent((scopedCompletedSubmissions.length / Math.max(1, submissions.length)) * 100),
        avgScorePct,
        passRate,
      },
      integritySignals: {
        fastCompletions,
        similarAnswerPairs,
      },
      visualizations: {
        correctVsIncorrect: {
          correct: questionMetrics.reduce((sum, q) => sum + q.correctCount, 0),
          incorrect: questionMetrics.reduce((sum, q) => sum + q.incorrectCount, 0),
          skipped: questionMetrics.reduce((sum, q) => sum + q.skippedCount, 0),
        },
        trendSeries,
      },
      questionMetrics,
      mostIncorrectQuestions,
      weakestTopics,
      slowestQuestionTypes,
      mostFlaggedQuestions,
      abnormalSkips,
      aiSummary,
      aiRecommendations,
      creatorQualityAlerts,
      trackingPlan: {
        experimentName: 'analytics-practice-loop-v1',
        primaryMetrics: ['retry_click_rate', 'practice_completion_rate', 'score_uplift_next_attempt'],
        eventKeys: ['analytics_open', 'analytics_action_click', 'practice_start_from_analytics'],
      },
      updatedAt: new Date().toISOString(),
    };
  }

  async getSubmissionTimeline(submissionId: string, user: RequestUser) {
    const submission = await this.prisma.examSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        studentId: true,
        status: true,
        startedAt: true,
        submittedAt: true,
        createdAt: true,
        exam: {
          select: {
            id: true,
            title: true,
            course: {
              select: {
                id: true,
                lecturerId: true,
              },
            },
          },
        },
        student: {
          select: {
            id: true,
            fullName: true,
            studentId: true,
            email: true,
          },
        },
        proctoring: {
          select: {
            id: true,
            tabSwitchCount: true,
            mouseAnomalies: true,
            flaggedStatus: true,
            integrityScore: true,
            logs: {
              orderBy: { timestamp: 'asc' },
              select: {
                id: true,
                eventType: true,
                details: true,
                timestamp: true,
              },
            },
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Không tìm thấy lượt làm bài');
    }

    const role = String(user.role || '').toUpperCase();
    const isOwner = submission.studentId === user.id;
    const isLecturer = submission.exam.course?.lecturerId === user.id;
    if (role === 'STUDENT' && !isOwner) {
      throw new ForbiddenException('Bạn không có quyền xem dòng thời gian này');
    }
    if (role === 'LECTURER' && !isLecturer) {
      throw new ForbiddenException('Bạn không có quyền xem dòng thời gian này');
    }

    // Label/severity come from the shared catalog — the same source
    // ExamMonitor.tsx's live alert feed and getIntegrityCases's reasons now
    // use, so this timeline, the monitor screen, and the integrity case
    // list describe the same event the same way.
    const severityFor = (eventType: string): 'normal' | 'warning' | 'critical' => {
      const severity = getIntegrityEventSeverity(eventType);
      return severity === 'low' ? 'normal' : severity;
    };

    const formatDetails = (details?: string | null) => {
      if (!details) return undefined;
      const parsed = this.parseLogDetails(details);
      if (!parsed) return details;
      if (typeof parsed === 'string') return parsed;
      return Object.entries(parsed)
        .filter(([, value]) => value !== null && typeof value !== 'undefined' && value !== '')
        .slice(0, 4)
        .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`)
        .join(' | ');
    };

    const events: Array<{
      id: string;
      timestamp: string;
      type: string;
      description: string;
      severity: 'normal' | 'warning' | 'critical';
      detail?: string;
    }> = [];

    if (submission.startedAt || submission.createdAt) {
      events.push({
        id: `${submission.id}-started`,
        timestamp: new Date(submission.startedAt || submission.createdAt).toISOString(),
        type: 'exam_start',
        description: 'Bắt đầu phiên làm bài',
        severity: 'normal',
        detail: undefined,
      });
    }

    for (const log of submission.proctoring?.logs || []) {
      const eventType = String(log.eventType || 'event').toLowerCase();
      events.push({
        id: log.id,
        timestamp: new Date(log.timestamp).toISOString(),
        type: eventType,
        description: getIntegrityEventLabel(eventType),
        severity: severityFor(eventType),
        detail: formatDetails(log.details),
      });
    }

    if (submission.submittedAt) {
      events.push({
        id: `${submission.id}-submitted`,
        timestamp: new Date(submission.submittedAt).toISOString(),
        type: 'submit',
        description: 'Đã nộp bài thi',
        severity: 'normal',
        detail: `Trạng thái: ${submission.status}`,
      });
    }

    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const warnings = events.filter((event) => event.severity === 'warning').length;
    const critical = events.filter((event) => event.severity === 'critical').length;
    const integrityNotes = events
      .filter((event) => event.severity !== 'normal')
      .map((event, index) => ({
        id: `note-${event.id}`,
        question: null,
        note: event.description,
        severity: event.severity,
        timestamp: event.timestamp,
        detail: event.detail,
        order: index + 1,
      }));

    return {
      submission: {
        id: submission.id,
        status: submission.status,
        startedAt: submission.startedAt,
        submittedAt: submission.submittedAt,
        exam: submission.exam,
        student: submission.student,
      },
      summary: {
        totalEvents: events.length,
        tabSwitches: Number(submission.proctoring?.tabSwitchCount || 0),
        mouseAnomalies: Number(submission.proctoring?.mouseAnomalies || 0),
        warnings,
        critical,
        anomalyScore: submission.proctoring?.integrityScore ? Number(submission.proctoring.integrityScore) : null,
        suspiciousFlag: Boolean(submission.proctoring?.flaggedStatus),
      },
      events,
      integrityNotes,
      updatedAt: new Date().toISOString(),
    };
  }

  async findAll(pagination?: PaginationDto) {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;

    const [submissions, total] = await Promise.all([
      this.prisma.examSubmission.findMany({
        include: {
          student: {
            select: {
              id: true,
              fullName: true,
              email: true,
              studentId: true,
            },
          },
          exam: {
            select: {
              id: true,
              title: true,
              totalPoints: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.examSubmission.count(),
    ]);

    return buildPaginatedResult(submissions, total, page, limit);
  }

  async findByStudent(studentId: string) {
    const submissions = await this.prisma.examSubmission.findMany({
      where: { studentId },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            totalPoints: true,
            passingScore: true,
            resultsPublishedAt: true,
            reviewSettings: true,
            course: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
        examInstance: true,
        integrityReview: {
          select: {
            status: true,
            reviewerNote: true,
            penaltyMode: true,
            penaltyPercent: true,
            penaltyAmount: true,
            academicScore: true,
            deductedScore: true,
            finalScore: true,
          },
        },
        scoreAdjustments: {
          where: { revokedAt: null },
          select: { id: true, amount: true, category: true, reason: true, createdAt: true },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    return submissions.map((submission) => {
      const adjustmentTotal = submission.scoreAdjustments.reduce(
        (total, adjustment) => total + this.toNumber(adjustment.amount),
        0,
      );
      const afterReview = (submission.exam.reviewSettings as any)?.enabled
        ? (submission.exam.reviewSettings as any)?.phases?.after
        : null;
      const canShowScore = Boolean(submission.exam.resultsPublishedAt)
        && (afterReview ? Boolean(afterReview.showScore) : true);
      if (canShowScore) {
        // A confirmed integrity penalty's finalScore is the true official
        // score — plain score+adjustments would show the pre-penalty number
        // (see docs/integrity-penalty-flow-trace.md §3), same override
        // getMyResultsHistory already applies.
        const integrityFinalScore = String(submission.integrityReview?.status || '').toUpperCase() === 'CONFIRMED'
          ? submission.integrityReview?.finalScore
          : null;
        const effectiveScore = integrityFinalScore != null
          ? this.toNumber(integrityFinalScore)
          : Number(Math.max(0, Math.min(10, this.toNumber(submission.score) + adjustmentTotal)).toFixed(2));
        return {
          ...submission,
          examInstance: this.sanitizeExamInstanceForStudent(submission.examInstance),
          academicScore: submission.score,
          score: effectiveScore,
          adjustmentTotal: Number(adjustmentTotal.toFixed(2)),
        };
      }
      return {
        ...submission,
        examInstance: this.sanitizeExamInstanceForStudent(submission.examInstance),
        score: null,
        gradedAt: null,
        // Status/reviewerNote stay visible pre-publish (the decision and its
        // reason aren't part of the score); the deduction amounts are, so
        // they wait for publish like everything else.
        integrityReview: submission.integrityReview
          ? {
              ...submission.integrityReview,
              penaltyMode: null,
              penaltyPercent: null,
              penaltyAmount: null,
              academicScore: null,
              deductedScore: null,
              finalScore: null,
            }
          : submission.integrityReview,
        // Same rule as the score itself — post-hoc adjustments are part of
        // the final grade, so they wait for publish too.
        scoreAdjustments: [],
      };
    });
  }

  // Shared with sanitizeStudentSubmissionView's provisional-score logic, but
  // kept as its own small helper rather than refactored into one — that
  // function's loop also builds the full per-question display payload, and
  // untangling just the scoring part out of it isn't worth the risk to
  // already-tuned code for what list callers need (aggregate numbers only).
  private computeAutoGradableTotals(answers: any[]): {
    autoRawScore: number;
    autoRawMax: number;
    hasAutoGradableAnswer: boolean;
    pendingManualCount: number;
  } {
    let autoRawScore = 0;
    let autoRawMax = 0;
    let hasAutoGradableAnswer = false;
    let pendingManualCount = 0;
    for (const answer of answers || []) {
      const snapshot = this.parseJsonValue(answer?.questionSnapshot?.payload, {});
      const question = answer?.question || {};
      const answerKey = snapshot.answerKey ?? snapshot.correctAnswer;
      const autoGradable = this.isAutoGradable(String(snapshot.type ?? question.type ?? ''), answerKey);
      const manualGradeAvailable = Boolean(answer?.manualGradedAt);
      const assignedScore = this.toNumber(
        snapshot.assignedScore ?? snapshot.points ?? question.points ?? question.defaultPoints,
        0,
      );
      if (autoGradable) {
        hasAutoGradableAnswer = true;
        autoRawMax += assignedScore;
        autoRawScore += this.toNumber(answer?.pointsAwarded, 0);
      } else if (!manualGradeAvailable) {
        pendingManualCount += 1;
      }
    }
    return { autoRawScore, autoRawMax, hasAutoGradableAnswer, pendingManualCount };
  }

  /** Student-facing, grouped result history. Scores remain subject to the
   * existing publication/review policy and are never inferred from pending work. */
  async getMyResultsHistory(studentId: string) {
    const submissions = await this.prisma.examSubmission.findMany({
      where: { studentId },
      select: {
        id: true,
        examId: true,
        attemptNo: true,
        status: true,
        score: true,
        startedAt: true,
        submittedAt: true,
        createdAt: true,
        exam: {
          select: {
            id: true,
            title: true,
            resultsPublishedAt: true,
            reviewSettings: true,
            gradingStrategy: true,
            settings: true,
            course: { select: { code: true, name: true } },
          },
        },
        integrityReview: {
          select: { status: true, finalScore: true },
        },
        scoreAdjustments: {
          where: { revokedAt: null },
          select: { amount: true },
        },
        answers: {
          select: {
            pointsAwarded: true,
            manualGradedAt: true,
            question: { select: { type: true, correctAnswer: true, points: true, defaultPoints: true } },
            questionSnapshot: { select: { payload: true } },
          },
        },
      },
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const groups = new Map<string, any>();
    for (const submission of submissions) {
      const afterReview = (submission.exam.reviewSettings as any)?.enabled
        ? (submission.exam.reviewSettings as any)?.phases?.after
        : null;
      const resultsPublished = Boolean(submission.exam.resultsPublishedAt);
      const canShowScore = resultsPublished
        && (afterReview ? Boolean(afterReview.showScore) : true);
      const adjustmentTotal = submission.scoreAdjustments.reduce(
        (total, adjustment) => total + this.toNumber(adjustment.amount),
        0,
      );
      // Same provisional-reveal rule as sanitizeStudentSubmissionView: only
      // meaningful pre-publish, and only when the lecturer opted in.
      const showResultImmediately = Boolean((submission.exam.settings as any)?.showResultImmediately);
      let provisionalScore: number | null = null;
      let pendingManualCount = 0;
      if (!resultsPublished && showResultImmediately) {
        const totals = this.computeAutoGradableTotals(submission.answers);
        pendingManualCount = totals.pendingManualCount;
        provisionalScore = totals.hasAutoGradableAnswer
          ? this.normalizeScore(totals.autoRawScore, totals.autoRawMax)
          : null;
      }
      const integrityFinalScore = String(submission.integrityReview?.status || '').toUpperCase() === 'CONFIRMED'
        ? submission.integrityReview?.finalScore
        : null;
      const effectiveScore = integrityFinalScore != null
        ? this.toNumber(integrityFinalScore)
        : Number(Math.max(0, Math.min(10, this.toNumber(submission.score) + adjustmentTotal)).toFixed(2));
      const visibleScore = canShowScore && submission.score != null ? effectiveScore : null;
      const strategy = String(
        submission.exam.gradingStrategy ?? (submission.exam.settings as any)?.gradingStrategy ?? 'HIGHEST',
      ).toUpperCase();
      const group = groups.get(submission.examId) || {
        examId: submission.examId,
        exam: {
          id: submission.exam.id,
          title: submission.exam.title,
          course: submission.exam.course,
          gradingStrategy: strategy,
        },
        attempts: [],
        lastActivityAt: submission.submittedAt || submission.startedAt || submission.createdAt,
        resultsPublished,
      };
      group.attempts.push({
        submissionId: submission.id,
        attemptNo: submission.attemptNo,
        status: submission.status,
        startedAt: submission.startedAt,
        submittedAt: submission.submittedAt,
        score: visibleScore,
        scoreAvailable: canShowScore && submission.score != null,
        provisionalScore,
        pendingManualCount,
      });
      const currentActivity = new Date(group.lastActivityAt || 0).getTime();
      const candidateActivity = new Date(submission.submittedAt || submission.startedAt || submission.createdAt).getTime();
      if (candidateActivity > currentActivity) group.lastActivityAt = submission.submittedAt || submission.startedAt || submission.createdAt;
      groups.set(submission.examId, group);
    }

    return [...groups.values()]
      .map((group) => {
        group.attempts.sort((left: any, right: any) => left.attemptNo - right.attemptNo);
        const scoredAttempts = group.attempts.filter((attempt: any) => attempt.scoreAvailable && attempt.score !== null);
        let officialScore: number | null = null;
        if (scoredAttempts.length > 0) {
          const strategy = group.exam.gradingStrategy;
          if (strategy === 'AVERAGE') {
            officialScore = scoredAttempts.reduce((sum: number, attempt: any) => sum + attempt.score, 0) / scoredAttempts.length;
          } else if (strategy === 'FIRST_ATTEMPT') {
            officialScore = scoredAttempts[0].score;
          } else if (strategy === 'LAST_ATTEMPT') {
            officialScore = scoredAttempts[scoredAttempts.length - 1].score;
          } else {
            officialScore = Math.max(...scoredAttempts.map((attempt: any) => attempt.score));
          }
          officialScore = Number(Math.max(0, Math.min(10, Number(officialScore))).toFixed(2));
        }
        return { ...group, officialScore, attemptCount: group.attempts.length };
      })
      .sort((left, right) => new Date(right.lastActivityAt || 0).getTime() - new Date(left.lastActivityAt || 0).getTime());
  }

  async getMySubmissionById(submissionId: string, studentId: string) {
    const submission = await this.prisma.examSubmission.findFirst({
      where: {
        id: submissionId,
        studentId,
      },
      include: {
        exam: {
          select: {
            id: true,
            title: true,
            totalPoints: true,
            endTime: true,
            timeLimitMinutes: true,
            duration: true,
            resultsPublishedAt: true,
            maxAttempts: true,
            settings: true,
            reviewSettings: true,
            course: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
        answers: {
          orderBy: [
            { questionId: 'asc' },
            { sequence: 'desc' },
            { updatedAt: 'desc' },
          ],
          include: {
            question: {
              select: {
                id: true,
                type: true,
                content: true,
                options: true,
                points: true,
                explanation: true,
                correctAnswer: true,
                mediaType: true,
                mediaUrl: true,
              },
            },
            questionSnapshot: { select: { payload: true } },
          },
        },
        proctoring: {
          select: {
            tabSwitchCount: true,
            mouseAnomalies: true,
            logs: true,
          },
        },
        integrityReview: {
          select: {
            status: true,
            reviewerNote: true,
            penaltyMode: true,
            penaltyPercent: true,
            penaltyAmount: true,
            academicScore: true,
            deductedScore: true,
            finalScore: true,
            penaltyAppliedAt: true,
          },
        },
      },
    });
    if (!submission) return submission;
    const scoreAdjustments = await this.prisma.scoreAdjustment.findMany({
      where: { submissionId: submission.id, revokedAt: null },
      select: { id: true, amount: true, category: true, reason: true, createdAt: true },
    });
    const [sanitizedSubmission, securityState] = await Promise.all([
      Promise.resolve(this.sanitizeStudentSubmissionView({ ...submission, scoreAdjustments })),
      this.getStudentSecurityState(submission.id),
    ]);
    return {
      ...sanitizedSubmission,
      securityState,
      deadline: this.resolveSubmissionDeadline({
        startedAt: submission.startedAt,
        deadlineOverrideAt: submission.deadlineOverrideAt,
        exam: submission.exam,
      })?.toISOString() ?? null,
    };
  }

  async findOne(id: string, user?: RequestUser) {
    if (user) {
      const role = String(user.role || '').toUpperCase();
      if (role === 'LECTURER' || role === 'ADMIN') {
        await this.accessPolicy.assertInstructorCanAccessSubmission(id, user);
      }
    }

    const submission = await this.prisma.examSubmission.findUnique({
      where: { id },
      include: {
        student: {
          select: {
            id: true,
            fullName: true,
            email: true,
            studentId: true,
          },
        },
        exam: {
          select: {
            id: true,
            title: true,
            totalPoints: true,
            passingScore: true,
            resultsPublishedAt: true,
            reviewSettings: true,
          },
        },
        answers: {
          include: {
            question: true,
            questionSnapshot: { select: { payload: true } },
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Không tìm thấy lượt làm bài');
    }

    if (user && String(user.role || '').toUpperCase() === 'STUDENT' && submission.student.id !== user.id) {
      throw new ForbiddenException('Bạn không có quyền truy cập lượt làm bài này');
    }

    return user && String(user.role || '').toUpperCase() === 'STUDENT'
      ? this.sanitizeStudentSubmissionView(submission)
      : submission;
  }

  /**
   * Shared data-shaping for both the CSV and PDF exports so the two formats
   * never drift apart. Scores/dates are kept in machine-friendly forms
   * (ISO-8601, plain decimals) so the same export can be re-imported into
   * a gradebook or analytics tool later, not just read by a human.
   */
  private async getExamResultsExportData(examId: string, user?: RequestUser) {
    if (user) {
      await this.accessPolicy.assertInstructorCanAccessExam(examId, user);
    }

    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: {
        id: true,
        title: true,
        totalPoints: true,
        passingScore: true,
        resultsPublishedAt: true,
        course: { select: { code: true, name: true } },
      },
    });
    if (!exam) {
      throw new NotFoundException('Không tìm thấy bài thi');
    }

    const submissions = await this.prisma.examSubmission.findMany({
      where: { examId, status: { in: ['SUBMITTED', 'GRADED', 'FLAGGED', 'FINALIZED'] } },
      include: {
        student: { select: { fullName: true, studentId: true, email: true } },
        scoreAdjustments: { select: { amount: true, revokedAt: true } },
        integrityReview: { select: { status: true, penaltyPercent: true, finalScore: true } },
      },
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const resultsPublished = Boolean(exam.resultsPublishedAt);
    // Passing threshold is an absolute point value on the same 0-10 scale as
    // finalScore below (e.g. 5.0 means "must score at least 5.0/10") — NOT a
    // percentage, even though the DB column has no unit of its own.
    const passingScorePoint = exam.passingScore != null ? Number(exam.passingScore) : null;

    const rows = submissions.map((s) => {
      const adjustmentTotal = (s.scoreAdjustments || [])
        .filter((a) => !a.revokedAt)
        .reduce((sum, a) => sum + this.toNumber(a.amount), 0);
      const rawScore = s.score != null ? this.toNumber(s.score) : null;
      // A confirmed integrity penalty's finalScore is the true official score
      // (see docs/integrity-penalty-flow-trace.md §3) — plain rawScore +
      // adjustmentTotal would export the pre-penalty number.
      const integrityFinalScore = String(s.integrityReview?.status || '').toUpperCase() === 'CONFIRMED'
        && s.integrityReview?.finalScore != null
        ? this.toNumber(s.integrityReview.finalScore)
        : null;
      const finalScore = integrityFinalScore != null
        ? integrityFinalScore
        : (rawScore != null
          ? Number(Math.max(0, Math.min(10, rawScore + adjustmentTotal)).toFixed(2))
          : null);
      const percentage = finalScore != null ? Number((finalScore * 10).toFixed(1)) : null;
      const passed = finalScore != null && passingScorePoint != null ? finalScore >= passingScorePoint : null;
      const durationMinutes = s.startedAt && s.submittedAt
        ? Math.max(0, Math.round((new Date(s.submittedAt).getTime() - new Date(s.startedAt).getTime()) / 60000))
        : null;

      return {
        studentId: s.student?.studentId || '',
        studentName: s.student?.fullName || '',
        email: s.student?.email || '',
        attemptNo: s.attemptNo,
        status: s.status || '',
        startedAt: s.startedAt ? new Date(s.startedAt).toISOString() : null,
        submittedAt: s.submittedAt ? new Date(s.submittedAt).toISOString() : null,
        gradedAt: s.gradedAt ? new Date(s.gradedAt).toISOString() : null,
        durationMinutes,
        rawScore,
        adjustmentTotal: Number(adjustmentTotal.toFixed(2)),
        finalScore,
        scale: 10,
        percentage,
        passed,
        integrityStatus: s.integrityReview?.status || null,
        integrityPenaltyPercent: s.integrityReview?.penaltyPercent ?? null,
        resultsPublished,
      };
    });

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        courseCode: exam.course?.code || '',
        courseName: exam.course?.name || '',
        totalPoints: exam.totalPoints,
        passingScorePoint,
        resultsPublishedAt: exam.resultsPublishedAt ? exam.resultsPublishedAt.toISOString() : null,
      },
      rows,
    };
  }

  private csvEscape(value: unknown): string {
    const str = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  }

  // Mirrors the labels the lecturer already sees on-screen for the same enum
  // (FE StatusBadge domain="submission"/"integrity", status-badge.tsx) — the
  // PDF/CSV export previously printed the raw English DB enum ("GRADED",
  // "SUBMITTED"...) verbatim instead of translating it.
  private getSubmissionStatusLabelVi(status: string | null | undefined): string {
    const labels: Record<string, string> = {
      IN_PROGRESS: 'Đang làm bài',
      SUBMITTED: 'Đã nộp bài',
      GRADED: 'Đã chấm',
      FLAGGED: 'Cần xem xét',
      FINALIZED: 'Đã hoàn tất',
    };
    return labels[String(status || '').toUpperCase()] || String(status || '-');
  }

  private getIntegrityStatusLabelVi(status: string | null | undefined): string {
    const labels: Record<string, string> = {
      PENDING: 'Chờ xem xét',
      REVIEWED: 'Đã xem xét',
      DISMISSED: 'Đã bỏ qua',
      CONFIRMED: 'Đã xác nhận',
    };
    return labels[String(status || '').toUpperCase()] || String(status || '-');
  }

  /**
   * Private, lecturer-authorized print payload. Unlike getExamAnswerMatrix(),
   * this intentionally exposes the student's stored answer for an audit PDF.
   * Question position is per student's immutable ExamInstance snapshot, so a
   * label such as C1 means the first question that particular student saw.
   */
  private async getExamDetailedPrintData(examId: string, user?: RequestUser) {
    if (user) await this.accessPolicy.assertInstructorCanAccessExam(examId, user);
    const submissions = await this.prisma.examSubmission.findMany({
      where: { examId, status: { in: ['SUBMITTED', 'GRADED', 'FLAGGED', 'FINALIZED'] } },
      select: {
        id: true, attemptNo: true, score: true,
        student: { select: { fullName: true, studentId: true } },
        examInstance: { select: { snapshotPayload: true, questionOrder: true } },
        examSnapshot: { select: { questions: { orderBy: { orderIndex: 'asc' }, select: { questionId: true, questionVersionId: true, questionSnapshotId: true, orderIndex: true, payload: true, questionSnapshot: { select: { payload: true } } } } } },
        answers: { select: { questionId: true, questionVersionId: true, questionSnapshotId: true, answer: true, isCorrect: true, pointsAwarded: true, manualGradedAt: true } },
      },
      orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const isBlank = (value: any) => {
      const parsed = this.parseJsonValue(value, value);
      if (parsed === null || typeof parsed === 'undefined') return true;
      if (typeof parsed === 'string') return !parsed.trim();
      if (Array.isArray(parsed)) return parsed.length === 0 || parsed.every((item) => !String(item ?? '').trim());
      return typeof parsed === 'object' && Object.keys(parsed).length === 0;
    };
    // Renders an answer/answerKey value as full, human-readable text (never
    // truncated — the print PDF's detail section needs the actual content,
    // not just a code letter) — reused for both the student's answer and the
    // question's answerKey so "Trả lời" and "Đáp án đúng" go through the same
    // formatting per question type.
    const formatAnswerValue = (raw: any, type: string, options?: Record<string, string>): string => {
      const parsed = this.parseJsonValue(raw, raw);
      if (parsed === null || typeof parsed === 'undefined') return '';
      const describeChoice = (code: any) => {
        const letter = String(code ?? '').trim();
        if (!letter) return '';
        return options?.[letter] ? `${letter}. ${options[letter]}` : letter;
      };
      switch (type) {
        case 'MULTIPLE_CHOICE':
        case 'SINGLE_CHOICE': {
          const candidate = Array.isArray(parsed) ? parsed : (parsed?.answer ?? parsed?.answers ?? parsed);
          const letters = Array.isArray(candidate) ? candidate : [candidate];
          return letters.map(describeChoice).filter(Boolean).join('; ');
        }
        case 'TRUE_FALSE': {
          // Stored either as a lettered choice (matching answerKey's A/B) or
          // as a literal boolean/"true"/"false" — normalize the latter so it
          // doesn't print the raw JS value verbatim.
          const candidate = Array.isArray(parsed) ? parsed[0] : (parsed?.answer ?? parsed?.answers ?? parsed);
          const normalized = String(candidate ?? '').trim().toLowerCase();
          if (normalized === 'true' || normalized === 'đúng') return 'Đúng';
          if (normalized === 'false' || normalized === 'sai') return 'Sai';
          return describeChoice(candidate);
        }
        case 'MATCHING': {
          const pairs = Array.isArray(parsed?.pairs) ? parsed.pairs : Array.isArray(parsed) ? parsed : [];
          return pairs
            .map((pair: any) => `${pair?.left ?? ''} → ${pair?.right ?? ''}`)
            .filter((line: string) => line !== ' → ')
            .join('; ');
        }
        case 'ORDERING': {
          const items = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
          return items.map((item: any, index: number) => `${index + 1}. ${item}`).join('  ');
        }
        case 'FIND_ERROR': {
          const answersList = Array.isArray(parsed?.answers) ? parsed.answers : Array.isArray(parsed) ? parsed : [parsed];
          return answersList.filter(Boolean).join(', ');
        }
        case 'ESSAY':
        case 'SHORT_ANSWER':
          return typeof parsed === 'string' ? parsed : String(parsed?.answer ?? '');
        default: {
          if (typeof parsed === 'string') return parsed;
          if (Array.isArray(parsed)) return parsed.join(', ');
          if (parsed && typeof parsed === 'object') {
            const candidate = parsed.answer ?? parsed.answers;
            return Array.isArray(candidate) ? candidate.join(', ') : candidate != null ? String(candidate) : Object.values(parsed).map(String).join(', ');
          }
          return String(parsed);
        }
      }
    };

    return submissions.map((submission) => {
      const payload = this.parseJsonValue(submission.examInstance?.snapshotPayload, {}) as any;
      const instanceQuestions = Array.isArray(payload?.questions) ? payload.questions : [];
      const snapshotQuestions = (submission.examSnapshot?.questions || []).map((question: any) => ({
        ...this.parseJsonValue(question.payload, {}),
        ...this.parseJsonValue(question.questionSnapshot?.payload, {}),
        questionId: question.questionId,
        questionVersionId: question.questionVersionId,
        questionSnapshotId: question.questionSnapshotId,
        orderIndex: question.orderIndex,
      }));
      // Older ExamInstances can retain questionOrder without duplicating the
      // questions in snapshotPayload. Their linked ExamSnapshot is immutable
      // too, and is therefore the safe historical fallback.
      const questions = instanceQuestions.length ? instanceQuestions : snapshotQuestions;
      const order = Array.isArray(submission.examInstance?.questionOrder) ? submission.examInstance?.questionOrder : [];
      const orderedQuestions = order.length
        ? [...questions].sort((left: any, right: any) => order.indexOf(left.questionSnapshotId ?? left.questionId) - order.indexOf(right.questionSnapshotId ?? right.questionId))
        : questions;
      const answers = new Map<string, any>((submission.answers || []).map((answer) => [answer.questionSnapshotId ?? answer.questionVersionId ?? answer.questionId, answer]));
      return {
        studentId: submission.student?.studentId || '-', studentName: submission.student?.fullName || '-', attemptNo: submission.attemptNo,
        score: submission.score != null ? Number(submission.score) : null,
        answers: orderedQuestions.map((question: any, index: number) => {
          const key = question.questionSnapshotId ?? question.questionVersionId ?? question.questionId;
          const answer = answers.get(key);
          const type = String(question.type || '');
          const isEssayType = type === 'ESSAY' || type === 'SHORT_ANSWER';
          const options = question.options && typeof question.options === 'object' ? question.options : undefined;
          const graded = isEssayType ? Boolean(answer?.manualGradedAt) : true;
          const pointsAwarded = answer?.pointsAwarded != null ? Number(answer.pointsAwarded) : null;
          // isBlank() only sees the raw JSON shape (e.g. `{pairs: []}` has a
          // key, so it isn't "blank" by that check alone) — the real test is
          // whether formatting it produces anything to show at all, so the
          // matrix/detail views don't render an empty "Trả lời:" as if the
          // student had answered.
          const rawBlank = isBlank(answer?.answer);
          const studentAnswerText = rawBlank ? '' : formatAnswerValue(answer?.answer, type, options);
          const blank = rawBlank || (!isEssayType && !studentAnswerText.trim());
          // null = "not yet meaningfully gradable" (blank, or essay not graded
          // yet) — distinct from `false` (graded and wrong), so the matrix
          // and detail section can render a neutral "—"/"TL" instead of a red ✕.
          const correct = blank ? null : isEssayType ? (graded ? pointsAwarded !== null && pointsAwarded > 0 : null) : (answer?.isCorrect ?? null);
          const correctAnswerKey = question.answerKey ?? question.correctAnswer;
          const correctAnswerText = !isEssayType && !isBlank(correctAnswerKey) ? formatAnswerValue(correctAnswerKey, type, options) : null;
          return {
            position: index + 1,
            questionType: type,
            questionStem: String(question.stem || question.content || '').trim(),
            assignedScore: Number(question.assignedScore ?? question.points ?? 0),
            pointsAwarded,
            blank,
            isEssay: isEssayType,
            graded,
            correct,
            studentAnswerText: blank ? '' : studentAnswerText,
            correctAnswerText,
          };
        }),
      };
    });
  }

  /**
   * Export exam results as CSV. UTF-8 BOM is prepended so Excel renders
   * Vietnamese names correctly instead of mojibake; scores/dates stay in
   * plain machine-readable form for downstream re-import.
   */
  async exportExamResultsCsv(examId: string, user?: RequestUser): Promise<string> {
    const { rows } = await this.getExamResultsExportData(examId, user);

    const header = [
      'Mã sinh viên', 'Họ và tên', 'Email', 'Lượt thi', 'Trạng thái',
      'Thời gian bắt đầu', 'Thời gian nộp bài', 'Thời gian chấm',
      'Thời gian làm bài (phút)', 'Điểm gốc (/10)', 'Điều chỉnh điểm',
      'Điểm cuối cùng (/10)', 'Tỷ lệ (%)', 'Kết quả',
      'Trạng thái toàn vẹn', 'Mức phạt toàn vẹn (%)', 'Đã công bố kết quả',
    ];

    const lines = [header.map((h) => this.csvEscape(h)).join(',')];
    for (const row of rows) {
      lines.push(
        [
          row.studentId,
          row.studentName,
          row.email,
          row.attemptNo,
          this.getSubmissionStatusLabelVi(row.status),
          row.startedAt ?? '',
          row.submittedAt ?? '',
          row.gradedAt ?? '',
          row.durationMinutes ?? '',
          row.rawScore ?? '',
          row.adjustmentTotal,
          row.finalScore ?? '',
          row.percentage ?? '',
          row.passed === null ? '' : row.passed ? 'Đạt' : 'Không đạt',
          row.integrityStatus ? this.getIntegrityStatusLabelVi(row.integrityStatus) : '',
          row.integrityPenaltyPercent ?? '',
          row.resultsPublished ? 'Có' : 'Chưa',
        ]
          .map((v) => this.csvEscape(v))
          .join(','),
      );
    }

    return String.fromCharCode(0xfeff) + lines.join('\r\n');
  }

  /**
   * Draws the ExamTrust mark (same artwork as examtrust-mark.svg used across
   * the app header/sidebar) using PDFKit vector primitives. Avoids embedding
   * a raster asset — the only PNG in the repo (FE/public/favicon.png) is a
   * base64-text file, not a real binary PNG, and pdfkit doesn't render SVG.
   */
  private drawExamTrustLogo(doc: PDFKit.PDFDocument, x: number, y: number, size: number): void {
    const scale = size / 512;
    doc.save();
    doc.translate(x, y).scale(scale);
    doc.roundedRect(0, 0, 512, 512, 112).fill('#176f8c');
    doc.roundedRect(9, 9, 494, 494, 105).lineWidth(18).stroke('#D9BE7A');
    doc.path('M256 84 L412 132 V272 C412 356 340 414 256 440 C172 414 100 356 100 272 V132 Z').fill('#D9BE7A');
    doc.path('M256 110 L390 151 V270 C390 341 327 392 256 415 C185 392 122 341 122 270 V151 Z').fill('#146B82');
    doc.save();
    doc.translate(14.5, 19.2).scale(0.92);
    doc.path('M196 246 L316 246 C320 282 322 300 320 310 L256 334 L192 310 C190 300 192 282 196 246 Z').fill('#D9C289');
    doc.save();
    doc.translate(0, 12);
    doc.path('M256 154 L386 210 L256 266 L126 210 Z').fill('#C7A85F');
    doc.restore();
    doc.path('M256 154 L386 210 L256 266 L126 210 Z').fill('#F0DEA8');
    doc.path('M256 206 C312 200 358 214 372 242').lineWidth(9).stroke('#B4903F');
    doc.path('M360 242 h24 a7 7 0 0 1 7 7 v11 a7 7 0 0 1 -7 7 h-24 a7 7 0 0 1 -7 -7 v-11 a7 7 0 0 1 7 -7 Z').fill('#D9C289');
    doc.path('M360 267 h24 l7 36 a10 10 0 0 1 -10 10 h-18 a10 10 0 0 1 -10 -10 Z').fill('#EBD79B');
    doc.circle(256, 210, 13).fill('#D9C289');
    doc.restore();
    doc.restore();
  }

  /**
   * Export exam results as a printable PDF report (summary + per-student table).
   */
  async exportExamResultsPdf(examId: string, user?: RequestUser): Promise<Buffer> {
    const { exam, rows } = await this.getExamResultsExportData(examId, user);
    const detailedStudents = await this.getExamDetailedPrintData(examId, user);

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.registerFont('VN', VN_FONT_REGULAR);
      doc.registerFont('VN-Bold', VN_FONT_BOLD);
      doc.font('VN');

      const gradedRows = rows.filter((r) => r.finalScore !== null);
      const avgScore = gradedRows.length
        ? gradedRows.reduce((sum, r) => sum + (r.finalScore || 0), 0) / gradedRows.length
        : null;
      const passedCount = rows.filter((r) => r.passed === true).length;

      const logoSize = 34;
      const headerTop = doc.y;
      this.drawExamTrustLogo(doc, doc.page.margins.left, headerTop, logoSize);
      doc.font('VN-Bold').fontSize(10).fillColor('#176f8c')
        .text('ExamTrust', doc.page.margins.left + logoSize + 8, headerTop + 10);
      doc.font('VN').fillColor('#000');
      doc.x = doc.page.margins.left;
      doc.y = headerTop;

      doc.fontSize(16).text('Báo cáo kết quả bài thi', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(12).text(exam.title, { align: 'center' });
      doc.moveDown(0.8);

      doc.fontSize(9).fillColor('#444');
      doc.text(`Mã bài thi: ${exam.id}`);
      doc.text(`Học phần: ${exam.courseCode ? `${exam.courseCode} - ${exam.courseName}` : exam.courseName || '-'}`);
      doc.text(`Tổng điểm: ${exam.totalPoints ?? '-'}    Điểm đạt: ${exam.passingScorePoint != null ? exam.passingScorePoint.toFixed(2) + '/10' : '-'}`);
      doc.text(`Kết quả đã công bố cho sinh viên: ${exam.resultsPublishedAt ? 'Có' : 'Chưa'}`);
      doc.text(`Tổng số lượt nộp bài: ${rows.length}    Điểm trung bình: ${avgScore != null ? avgScore.toFixed(2) : '-'}/10    Tỷ lệ đạt: ${rows.length ? Math.round((passedCount / rows.length) * 100) : 0}%`);
      doc.text(`Xuất lúc: ${new Date().toLocaleString('vi-VN')}`);
      doc.moveDown(0.8);
      doc.fillColor('#000');

      const columns: { key: keyof typeof rows[number]; label: string; width: number }[] = [
        { key: 'studentId', label: 'MSSV', width: 60 },
        { key: 'studentName', label: 'Họ và tên', width: 115 },
        { key: 'attemptNo', label: 'Lượt', width: 30 },
        { key: 'finalScore', label: 'Điểm', width: 40 },
        { key: 'percentage', label: 'Tỷ lệ', width: 40 },
        { key: 'passed', label: 'Kết quả', width: 45 },
        { key: 'status', label: 'Trạng thái', width: 70 },
        { key: 'submittedAt', label: 'Nộp lúc', width: 100 },
      ];
      const tableLeft = doc.page.margins.left;
      const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);
      const rowHeight = 18;
      const bottomLimit = doc.page.height - doc.page.margins.bottom;

      const formatCell = (row: (typeof rows)[number], key: string): string => {
        switch (key) {
          case 'finalScore':
            return row.finalScore != null ? row.finalScore.toFixed(2) : '-';
          case 'percentage':
            return row.percentage != null ? `${row.percentage}%` : '-';
          case 'passed':
            return row.passed === null ? '-' : row.passed ? 'Đạt' : 'Không đạt';
          case 'submittedAt':
            return row.submittedAt ? new Date(row.submittedAt).toLocaleString('vi-VN') : '-';
          case 'status':
            return this.getSubmissionStatusLabelVi(row.status);
          default:
            return String((row as any)[key] ?? '-');
        }
      };

      const drawHeaderRow = (y: number) => {
        doc.font('VN-Bold').fontSize(8);
        let x = tableLeft;
        for (const col of columns) {
          doc.text(col.label, x + 2, y + 4, { width: col.width - 4 });
          x += col.width;
        }
        doc.font('VN').fontSize(8);
        doc
          .moveTo(tableLeft, y + rowHeight)
          .lineTo(tableLeft + tableWidth, y + rowHeight)
          .strokeColor('#999')
          .stroke();
      };

      let y = doc.y;
      drawHeaderRow(y);
      y += rowHeight;

      if (rows.length === 0) {
        doc.fontSize(9).text('Chưa có lượt nộp bài nào cho bài thi này.', tableLeft, y + 6);
      }

      for (const row of rows) {
        if (y + rowHeight > bottomLimit) {
          doc.addPage();
          y = doc.page.margins.top;
          drawHeaderRow(y);
          y += rowHeight;
        }
        let x = tableLeft;
        for (const col of columns) {
          doc.text(formatCell(row, col.key as string), x + 2, y + 4, { width: col.width - 4, ellipsis: true });
          x += col.width;
        }
        y += rowHeight;
      }

      // Page two onward: per-student answer audit. A student's C1/C2 labels
      // deliberately follow their own randomized immutable snapshot; they are
      // not cross-student question-comparison columns. This is a compact
      // overview (✓/✕ symbols only, colored) — the full unabridged answer
      // text lives in the "Chi tiết đáp án" section further below.
      const maxQuestions = Math.max(0, ...detailedStudents.map((student) => student.answers.length));
      const idWidth = 78;
      const nameWidth = 125;
      const scoreWidth = 42;
      // Sized from the fixed A4-landscape/28pt-margin geometry used below
      // (not a live `doc.page` read, since no landscape page exists yet at
      // this point) so the column count is chosen BEFORE any page is added —
      // every chunk's total width is guaranteed to stay within the printable
      // width, however many/few columns land in the last chunk.
      const landscapeRight = 841.89 - 28;
      const landscapeLeft = 28;
      const availableForQuestions = landscapeRight - landscapeLeft - idWidth - nameWidth - scoreWidth;
      const minQuestionColWidth = 22;
      const maxQuestionColWidth = 40;
      // One fixed column width for the whole export (not recomputed per
      // chunk) — otherwise a short exam's 7 questions would each stretch to
      // fill the row (huge gaps between C1/C2/...), while a long exam's
      // columns would still divide evenly but far too wide for the last,
      // smaller chunk. Instead: shrink as the question count grows, floor at
      // minQuestionColWidth (still legible), cap at maxQuestionColWidth (so
      // a handful of questions doesn't spread out unreasonably either).
      const questionColWidth = Math.min(
        maxQuestionColWidth,
        Math.max(minQuestionColWidth, availableForQuestions / Math.max(1, maxQuestions)),
      );
      const maxColsPerPage = Math.max(1, Math.floor(availableForQuestions / questionColWidth));
      const questionChunks = Array.from({ length: Math.ceil(maxQuestions / maxColsPerPage) }, (_, index) => ({
        start: index * maxColsPerPage,
        end: Math.min(maxQuestions, (index + 1) * maxColsPerPage),
      }));
      // Same 4-band score-ratio scheme as the web "Ma trận đáp án" dialog
      // (getExamAnswerMatrix) — a manually-graded essay is essentially never
      // a clean right/wrong, so it never collapses into ✓/✕; it always
      // prints as "TL" (the one consistent symbol for "graded on a scale"),
      // colored by how much of the question's points were actually earned.
      const essayTierColor = (ratio: number): string =>
        ratio >= 0.75 ? '#16a34a' : ratio >= 0.5 ? '#65a30d' : ratio >= 0.25 ? '#ea580c' : '#dc2626';
      const matrixCell = (answer: (typeof detailedStudents)[number]['answers'][number] | undefined): { symbol: string; color: string } => {
        if (!answer || answer.blank) return { symbol: '—', color: '#999' };
        if (answer.isEssay) {
          if (!answer.graded) return { symbol: 'TL', color: '#b45309' };
          const ratio = answer.assignedScore > 0 ? (answer.pointsAwarded ?? 0) / answer.assignedScore : ((answer.pointsAwarded ?? 0) > 0 ? 1 : 0);
          return { symbol: 'TL', color: essayTierColor(ratio) };
        }
        if (answer.correct === true) return { symbol: '✓', color: '#16a34a' };
        if (answer.correct === false) return { symbol: '✕', color: '#dc2626' };
        // Answered, but this question type has no fixed answer key to check
        // against (e.g. điền-vào-chỗ-trống without an exact-match key) — a
        // real answer exists, just not auto-verdictable, so it must read
        // differently from "—" (truly no answer) or a lecturer scanning the
        // matrix would mistake "answered but ungraded" for "skipped".
        return { symbol: '•', color: '#2563eb' };
      };
      for (const chunk of questionChunks) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 28 });
        const left = doc.page.margins.left;
        const top = doc.page.margins.top;
        const right = doc.page.width - doc.page.margins.right;
        const rowH = 18;
        const questionWidth = questionColWidth;
        const matrixHeader = (pageY: number) => {
          doc.font('VN-Bold').fontSize(12).fillColor('#000').text('Ma trận phương án thí sinh đã chọn', left, pageY);
          doc.font('VN').fontSize(8).fillColor('#555').text(`C${chunk.start + 1}–C${chunk.end}: thứ tự câu hỏi trong đề riêng của từng thí sinh. ✓ đúng (xanh) · ✕ sai (đỏ) · • đã trả lời, chưa có kết quả tự động (xanh dương) · — không trả lời · TL tự luận: cam = chưa chấm, còn lại tô theo % điểm đạt được (xanh lá ≥75% → xanh chuối 50–74% → cam đậm 25–49% → đỏ <25%). Đáp án chi tiết ở phần sau.`, left, pageY + 16, { width: right - left });
          let x = left;
          const headers = ['MSSV', 'Họ và tên', ...Array.from({ length: chunk.end - chunk.start }, (_, index) => `C${chunk.start + index + 1}`), 'Điểm'];
          const widths = [idWidth, nameWidth, ...Array(chunk.end - chunk.start).fill(questionWidth), scoreWidth];
          doc.font('VN-Bold').fontSize(7).fillColor('#000');
          headers.forEach((header, index) => { doc.text(header, x + 2, pageY + 38, { width: widths[index] - 4, align: index >= 2 ? 'center' : 'left', ellipsis: true }); x += widths[index]; });
          doc.moveTo(left, pageY + 52).lineTo(right, pageY + 52).strokeColor('#888').stroke();
          return { y: pageY + 52, widths };
        };
        let matrix = matrixHeader(top);
        for (const student of detailedStudents) {
          if (matrix.y + rowH > doc.page.height - doc.page.margins.bottom) { doc.addPage({ size: 'A4', layout: 'landscape', margin: 28 }); matrix = matrixHeader(doc.page.margins.top); }
          let x = left;
          doc.font('VN').fontSize(7).fillColor('#000');
          doc.text(student.studentId, x + 2, matrix.y + 5, { width: matrix.widths[0] - 4, ellipsis: true });
          x += matrix.widths[0];
          doc.text(student.studentName, x + 2, matrix.y + 5, { width: matrix.widths[1] - 4, ellipsis: true });
          x += matrix.widths[1];
          for (let index = chunk.start; index < chunk.end; index++) {
            const { symbol, color } = matrixCell(student.answers[index]);
            doc.fillColor(color).text(symbol, x + 2, matrix.y + 5, { width: matrix.widths[2 + (index - chunk.start)] - 4, align: 'center' });
            x += matrix.widths[2 + (index - chunk.start)];
          }
          doc.fillColor('#000').text(student.score != null ? student.score.toFixed(2) : '-', x + 2, matrix.y + 5, { width: matrix.widths[matrix.widths.length - 1] - 4, align: 'center' });
          matrix.y += rowH;
        }
      }

      // Full per-student, per-question answer detail — unabridged text (the
      // matrix above only shows a ✓/✕/TL symbol per cell), so "what did they
      // actually write/pick" and "what was the correct answer" are readable.
      if (detailedStudents.length) {
        const QUESTION_TYPE_LABELS_VI: Record<string, string> = {
          MULTIPLE_CHOICE: 'Trắc nghiệm nhiều lựa chọn',
          SINGLE_CHOICE: 'Một lựa chọn',
          TRUE_FALSE: 'Đúng / Sai',
          FILL_IN_BLANK: 'Điền vào chỗ trống',
          MATCHING: 'Ghép đôi',
          ORDERING: 'Sắp xếp thứ tự',
          FIND_ERROR: 'Tìm lỗi sai',
          ESSAY: 'Tự luận',
          SHORT_ANSWER: 'Trả lời ngắn',
        };
        doc.addPage({ size: 'A4', margin: 40 });
        let dy = doc.page.margins.top;
        const dLeft = doc.page.margins.left;
        const dWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const ensureSpace = (neededHeight: number) => {
          if (dy + neededHeight > doc.page.height - doc.page.margins.bottom) {
            doc.addPage({ size: 'A4', margin: 40 });
            dy = doc.page.margins.top;
          }
        };
        const drawWrapped = (text: string, options: { fontKey: string; size: number; color: string }) => {
          doc.font(options.fontKey).fontSize(options.size);
          const height = doc.heightOfString(text, { width: dWidth });
          ensureSpace(height + 4);
          doc.fillColor(options.color).text(text, dLeft, dy, { width: dWidth });
          dy += height + 4;
        };

        doc.font('VN-Bold').fontSize(13).fillColor('#000').text('Chi tiết đáp án theo từng thí sinh', dLeft, dy);
        dy += 22;

        for (const student of detailedStudents) {
          ensureSpace(24);
          doc.moveTo(dLeft, dy).lineTo(dLeft + dWidth, dy).strokeColor('#ccc').stroke();
          dy += 6;
          drawWrapped(
            `${student.studentId} — ${student.studentName} (Lượt ${student.attemptNo}) — Điểm: ${student.score != null ? student.score.toFixed(2) : '-'}/10`,
            { fontKey: 'VN-Bold', size: 10, color: '#000' },
          );
          for (const answer of student.answers) {
            const typeLabel = QUESTION_TYPE_LABELS_VI[answer.questionType] || answer.questionType;
            drawWrapped(`Câu ${answer.position} (${typeLabel} · ${answer.assignedScore} điểm)`, { fontKey: 'VN-Bold', size: 9, color: '#333' });
            if (answer.questionStem) drawWrapped(answer.questionStem, { fontKey: 'VN', size: 9, color: '#000' });
            const answerColor = answer.blank
              ? '#999'
              : answer.isEssay
                ? (answer.graded
                    ? essayTierColor(answer.assignedScore > 0 ? (answer.pointsAwarded ?? 0) / answer.assignedScore : ((answer.pointsAwarded ?? 0) > 0 ? 1 : 0))
                    : '#b45309')
                : answer.correct === true ? '#16a34a' : answer.correct === false ? '#dc2626' : '#2563eb';
            const answerLine = answer.blank
              ? 'Trả lời: (không trả lời)'
              : answer.isEssay
                ? `Trả lời: ${answer.studentAnswerText}${answer.graded ? ` (${answer.pointsAwarded ?? 0}/${answer.assignedScore} điểm)` : ' (chưa chấm)'}`
                : `Trả lời: ${answer.studentAnswerText}`;
            drawWrapped(answerLine, { fontKey: 'VN', size: 9, color: answerColor });
            if (answer.correctAnswerText && answer.correct !== true) {
              drawWrapped(`Đáp án đúng: ${answer.correctAnswerText}`, { fontKey: 'VN', size: 9, color: '#16a34a' });
            }
            dy += 4;
          }
          dy += 8;
        }
      }

      const pageRange = doc.bufferedPageRange();
      for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
        doc.switchToPage(i);
        const pageNumber = i - pageRange.start + 1;
        // The footer sits a few points below the content margin, in the
        // page's own margin gutter — that y is past page.maxY() (height -
        // margins.bottom), so pdfkit's automatic overflow check in `.text()`
        // (it compares against maxY before drawing anything) treats it as
        // "doesn't fit" and silently inserts a whole new blank page to hold
        // it, once per existing page, before the footer is drawn on THAT new
        // page instead. `height` gives this call its own maxY (startY +
        // height) so that check never fires for this one short footer line.
        doc.font('VN').fontSize(7).fillColor('#888').text(
          `Trang ${pageNumber}/${pageRange.count}`,
          doc.page.margins.left,
          doc.page.height - doc.page.margins.bottom + 12,
          { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'right', height: 20 },
        );
      }

      doc.end();
    });
  }

  async getStudentSubmission(examId: string, studentId: string) {
    const include = {
        include: {
        exam: {
          select: {
            id: true,
            title: true,
            totalPoints: true,
            maxAttempts: true,
            settings: true,
            resultsPublishedAt: true,
          },
        },
        answers: {
          orderBy: [
            { questionId: 'asc' },
            { sequence: 'desc' },
            { updatedAt: 'desc' },
          ],
          include: {
            question: {
              select: {
                id: true,
                type: true,
                content: true,
                options: true,
                points: true,
                explanation: true,
                // Include correct answer for review
                correctAnswer: true,
                mediaType: true,
                mediaUrl: true,
              },
            },
            questionSnapshot: { select: { payload: true } },
          },
        },
        proctoring: {
          select: {
            tabSwitchCount: true,
            mouseAnomalies: true,
            logs: true,
          },
        },
        scoreAdjustments: {
          where: { revokedAt: null },
          select: { id: true, amount: true, category: true, reason: true, createdAt: true },
        },
        integrityReview: {
          select: {
            status: true,
            reviewerNote: true,
            penaltyMode: true,
            penaltyPercent: true,
            penaltyAmount: true,
            academicScore: true,
            deductedScore: true,
            finalScore: true,
            penaltyAppliedAt: true,
          },
        },
      },
    } as const;

    // A refresh/resume must resolve the active attempt first. Returning the
    // latest completed attempt here made the ready screen look like a new
    // start and could surface the max-attempt error for an unfinished exam.
    const active = await this.prisma.examSubmission.findFirst({
      where: { examId, studentId, status: 'IN_PROGRESS' },
      ...include,
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (active) return active;

    return this.prisma.examSubmission.findFirst({
      where: { examId, studentId },
      ...include,
      orderBy: [{ attemptNo: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async reopenSubmission(submissionId: string, reason: string, user: RequestUser) {
    const trimmedReason = String(reason || '').trim();
    if (trimmedReason.length < 3) {
      throw new BadRequestException('Cần ghi rõ lý do mở lại lượt làm bài');
    }

    const submission = await this.prisma.examSubmission.findUnique({
      where: { id: submissionId },
      include: {
        exam: { select: { id: true, resultsPublishedAt: true } },
        answers: { select: { id: true, manualGradedAt: true } },
        scoreAdjustments: { where: { revokedAt: null }, select: { id: true } },
        examInstance: { select: { id: true } },
      },
    });
    if (!submission) throw new NotFoundException('Không tìm thấy lượt làm bài');
    await this.accessPolicy.assertInstructorCanAccessExam(submission.examId, user);

    if (!['SUBMITTED', 'GRADED', 'FLAGGED'].includes(String(submission.status).toUpperCase())) {
      throw new ConflictException('Chỉ có thể mở lại lượt đã nộp nhưng chưa chấm/khóa kết quả');
    }
    if (submission.exam.resultsPublishedAt) {
      throw new ConflictException('Không thể mở lại lượt sau khi kết quả bài thi đã được công bố');
    }
    if (submission.answers.some((answer) => Boolean(answer.manualGradedAt))) {
      throw new ConflictException('Không thể mở lại lượt đã có chấm thủ công');
    }
    if (submission.scoreAdjustments.length > 0) {
      throw new ConflictException('Không thể mở lại lượt đã có hiệu chỉnh điểm');
    }

    const now = new Date();
    const reopened = await this.prisma.$transaction(async (tx) => {
      await tx.submissionAnswer.updateMany({
        where: { submissionId },
        data: {
          isCorrect: null,
          pointsAwarded: null,
          feedback: null,
          manualGradedAt: null,
        },
      });
      const nextSubmission = await tx.examSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'IN_PROGRESS',
          score: null,
          submittedAt: null,
          autoSubmittedAt: null,
          gradedAt: null,
          submitLockedAt: null,
          submitIdempotencyKey: null,
          finalSnapshotVersion: null,
          lastActivityAt: now,
          version: { increment: 1 },
        },
      });
      if (submission.examInstance?.id) {
        await tx.examInstance.update({
          where: { id: submission.examInstance.id },
          data: {
            status: 'IN_PROGRESS',
            submittedAt: null,
            rawScore: null,
            maxRawScore: null,
            normalizedScore: null,
            lastActivityAt: now,
          },
        });
      }
      return nextSubmission;
    });

    // EventStore is the durable audit trail already used by the platform.
    // A failed realtime publish is non-fatal inside QueueService; persistence
    // of this critical event remains explicit and searchable by submission.
    await this.queueService.publishEvent({
      kind: 'exam_submission_reopened',
      critical: true,
      dedupId: `exam_submission_reopened:${submissionId}:${reopened.version}`,
      payload: {
        submissionId,
        examId: submission.examId,
        previousStatus: submission.status,
        actor: { id: user.id, role: user.role },
        reason: trimmedReason,
        reopenedAt: now.toISOString(),
      },
    });

    return {
      id: reopened.id,
      status: reopened.status,
      attemptNo: reopened.attemptNo,
      reopenedAt: now.toISOString(),
    };
  }

  async extendSubmissionDeadline(
    submissionId: string,
    dto: { deadlineAt: string; reason: string },
    user: RequestUser,
  ) {
    const reason = String(dto.reason || '').trim();
    const deadlineAt = new Date(dto.deadlineAt);
    if (reason.length < 3) {
      throw new BadRequestException('Cần ghi rõ lý do gia hạn deadline');
    }
    if (!Number.isFinite(deadlineAt.getTime()) || deadlineAt.getTime() <= Date.now()) {
      throw new BadRequestException('Deadline mới phải là một thời điểm trong tương lai');
    }

    const submission = await this.prisma.examSubmission.findUnique({
      where: { id: submissionId },
      include: {
        exam: {
          select: {
            id: true,
            endTime: true,
            timeLimitMinutes: true,
            duration: true,
            resultsPublishedAt: true,
          },
        },
        answers: { select: { manualGradedAt: true } },
        scoreAdjustments: { where: { revokedAt: null }, select: { id: true } },
        examInstance: { select: { id: true } },
      },
    });
    if (!submission) throw new NotFoundException('Không tìm thấy lượt làm bài');
    await this.accessPolicy.assertInstructorCanAccessExam(submission.examId, user);

    const previousDeadline = this.resolveSubmissionDeadline(submission);
    if (previousDeadline && deadlineAt.getTime() <= previousDeadline.getTime()) {
      throw new BadRequestException('Deadline mới phải muộn hơn deadline hiện tại');
    }

    const status = String(submission.status || '').toUpperCase();
    const shouldReopen = status !== 'IN_PROGRESS';
    if (shouldReopen) {
      if (!['SUBMITTED', 'GRADED', 'FLAGGED'].includes(status) || !submission.autoSubmittedAt) {
        throw new ConflictException('Chỉ có thể gia hạn lại lượt đang làm hoặc lượt đã được hệ thống tự nộp');
      }
      if (submission.exam.resultsPublishedAt) {
        throw new ConflictException('Không thể mở lại lượt sau khi kết quả bài thi đã được công bố');
      }
      if (submission.answers.some((answer) => Boolean(answer.manualGradedAt))) {
        throw new ConflictException('Không thể mở lại lượt đã có chấm thủ công');
      }
      if (submission.scoreAdjustments.length > 0) {
        throw new ConflictException('Không thể mở lại lượt đã có hiệu chỉnh điểm');
      }
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      if (shouldReopen) {
        await tx.submissionAnswer.updateMany({
          where: { submissionId },
          data: {
            isCorrect: null,
            pointsAwarded: null,
            feedback: null,
            manualGradedAt: null,
          },
        });
      }

      const nextSubmission = await tx.examSubmission.update({
        where: { id: submissionId },
        data: shouldReopen
          ? {
              status: 'IN_PROGRESS',
              deadlineOverrideAt: deadlineAt,
              autoSubmittedAt: null,
              score: null,
              submittedAt: null,
              gradedAt: null,
              submitLockedAt: null,
              submitIdempotencyKey: null,
              finalSnapshotVersion: null,
              lastActivityAt: now,
              version: { increment: 1 },
            }
          : {
              deadlineOverrideAt: deadlineAt,
              lastActivityAt: now,
              version: { increment: 1 },
            },
      });

      if (shouldReopen && submission.examInstance?.id) {
        await tx.examInstance.update({
          where: { id: submission.examInstance.id },
          data: {
            status: 'IN_PROGRESS',
            submittedAt: null,
            rawScore: null,
            maxRawScore: null,
            normalizedScore: null,
            lastActivityAt: now,
          },
        });
      }
      return nextSubmission;
    });

    await this.queueService.publishEvent({
      kind: 'exam_submission_deadline_extended',
      critical: true,
      dedupId: `exam_submission_deadline_extended:${submissionId}:${updated.version}`,
      payload: {
        submissionId,
        examId: submission.examId,
        actor: { id: user.id, role: user.role },
        reason,
        previousDeadline: previousDeadline?.toISOString() ?? null,
        deadlineAt: deadlineAt.toISOString(),
        previousStatus: submission.status,
        reopened: shouldReopen,
        extendedAt: now.toISOString(),
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      attemptNo: updated.attemptNo,
      deadline: deadlineAt.toISOString(),
      reopened: shouldReopen,
    };
  }

  private resolveConfiguredMaxAttempts(exam: { maxAttempts?: number | null; settings?: any }): number | null {
    const rawSettings = exam?.settings;
    const settingsMaxAttempts =
      rawSettings && typeof rawSettings === 'object' && rawSettings.maxAttempts !== undefined && rawSettings.maxAttempts !== null
        ? Number(rawSettings.maxAttempts)
        : null;
    const resolved =
      exam?.maxAttempts ?? settingsMaxAttempts;
    if (resolved === null || resolved === undefined || Number.isNaN(Number(resolved))) {
      return null;
    }
    return Math.max(1, Math.floor(Number(resolved)));
  }

  private isUnlimitedAttemptsExam(exam: { maxAttempts?: number | null; settings?: any }): boolean {
    return this.resolveConfiguredMaxAttempts(exam) === null;
  }

  private collapseLatestCompletedSubmissions<T extends { id: string; studentId?: string | null; status?: string | null; submittedAt?: Date | string | null; createdAt?: Date | string | null }>(submissions: T[]) {
    const buckets = new Map<string, T>();
    for (const submission of submissions) {
      const studentKey = submission.studentId || submission.id;
      const current = buckets.get(studentKey);
      const currentTime = current ? new Date(current.submittedAt || current.createdAt || 0).getTime() : -1;
      const nextTime = new Date(submission.submittedAt || submission.createdAt || 0).getTime();
      if (!current || nextTime >= currentTime) {
        buckets.set(studentKey, submission);
      }
    }
    return Array.from(buckets.values());
  }

  async updateStatus(id: string, updateDto: UpdateSubmissionStatusDto, user?: RequestUser) {
    if (user) {
      await this.accessPolicy.assertInstructorCanAccessSubmission(id, user);
    }

    const submission = await this.prisma.examSubmission.findUnique({
      where: { id },
    });

    if (!submission) {
      throw new NotFoundException('Không tìm thấy lượt làm bài');
    }

    const updated = await this.prisma.examSubmission.update({
      where: { id },
      data: { status: updateDto.status },
    });



    return updated;
  }
}
