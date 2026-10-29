import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash, randomUUID } from 'crypto';
import type { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { AccessPolicyService } from '../common/services/access-policy.service';

const KNOWN_SIGNAL_SLUGS = ['tab_switch', 'fullscreen_exit', 'paste_external', 'mouse_idle'];

// Human-readable object key so evidence is identifiable directly in the R2
// bucket — the unguessable part (capture.id, a uuid) stays DB-only, never in
// this path; access is gated by assertInstructorCanAccessExam on every read,
// not by path secrecy.
function buildEvidenceStorageKey(params: {
  examId: string;
  submissionId: string;
  trigger: 'SCHEDULED' | 'SUSPICIOUS_EVENT';
  triggerDetails: unknown;
  captureSource: string;
  ordinal: number;
  extension: string;
}): string {
  const signals = Array.isArray((params.triggerDetails as { signals?: unknown[] } | null)?.signals)
    ? ((params.triggerDetails as { signals: unknown[] }).signals as unknown[]).map(String)
    : [];
  const eventSlug = params.trigger === 'SCHEDULED'
    ? 'scheduled'
    : signals.find((s) => KNOWN_SIGNAL_SLUGS.includes(s)) || 'event';
  const sourceSlug = params.captureSource.toLowerCase();
  const ordinal = String(params.ordinal).padStart(2, '0');
  return `proctoring-evidence/${params.examId}/${params.submissionId}/${eventSlug}_${sourceSlug}_${ordinal}.${params.extension}`;
}

type WebcamEvidencePolicy = {
  enabled: boolean;
  examProfile: 'THEORY' | 'MIXED' | 'CALCULATION';
  scheduledCaptureIntervalSeconds: number | null;
  scheduledCaptureOffsetsMs: number[];
  eventCooldownMs: number;
  mouseIdleThresholdMs: number;
  retentionDays: number;
  consentVersion: string;
  requireFullScreenCapture: boolean;
  screenCaptureEnabled: boolean;
};

const SCHEDULED_CAPTURE_GRACE_MS = 90_000;
// Default schedule when the lecturer hasn't configured an interval — 5 fixed
// checkpoints by % of exam duration (0/25/50/75/100%).
const SCHEDULED_CAPTURE_PERCENTAGES = [0, 0.25, 0.5, 0.75, 1];
// A full-length exam with a tiny interval is bounded by the slot ceiling
// below, not by this floor — this just rejects a zero/negative value.
const MIN_SCHEDULED_CAPTURE_INTERVAL_SECONDS = 1;
const MAX_SCHEDULED_CAPTURE_SLOTS = 200;
const MIN_MOUSE_IDLE_THRESHOLD_MS = 1_000;
const MIN_EVENT_COOLDOWN_MS = 1_000;
const DEFAULT_MOUSE_IDLE_THRESHOLD_MS = 60_000;

const DEFAULT_POLICY: WebcamEvidencePolicy = {
  enabled: false,
  examProfile: 'MIXED',
  scheduledCaptureIntervalSeconds: null,
  scheduledCaptureOffsetsMs: [],
  eventCooldownMs: 60_000,
  mouseIdleThresholdMs: DEFAULT_MOUSE_IDLE_THRESHOLD_MS,
  retentionDays: 30,
  consentVersion: 'webcam-evidence-v1',
  requireFullScreenCapture: false,
  screenCaptureEnabled: false,
};

// Fixed cadence from the start, but always guarantees a final capture at
// exam end even when the duration isn't an exact multiple of the interval
// (e.g. a 12-minute exam with a 5-minute interval still captures at
// 0, 5, 10, AND 12 — not just 0/5/10 leaving the last ~2 minutes unwatched).
function buildIntervalOffsets(durationMs: number, intervalMs: number): number[] {
  const offsets: number[] = [];
  for (let t = 0; t <= durationMs && offsets.length < MAX_SCHEDULED_CAPTURE_SLOTS; t += intervalMs) {
    offsets.push(t);
  }
  const last = offsets[offsets.length - 1];
  if (last === undefined || durationMs - last > 1_000) {
    if (offsets.length >= MAX_SCHEDULED_CAPTURE_SLOTS) offsets.pop();
    offsets.push(durationMs);
  }
  return offsets;
}

@Injectable()
export class ProctoringEvidenceService implements OnModuleInit {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly accessPolicy: AccessPolicyService,
    private readonly config: ConfigService,
  ) {
    const accountId = this.config.get<string>('R2_ACCOUNT_ID');
    const endpoint =
      this.config.get<string>('R2_ENDPOINT') ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

    this.bucket = this.config.get<string>('R2_BUCKET_NAME') ?? '';
    this.s3 = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: this.config.get<string>('R2_ACCESS_KEY_ID') ?? '',
        secretAccessKey: this.config.get<string>('R2_SECRET_ACCESS_KEY') ?? '',
      },
    });
  }

  onModuleInit() {
    const run = () => this.purgeExpired().catch(() => undefined);
    run();
    const timer = setInterval(run, 24 * 60 * 60 * 1000);
    timer.unref();
  }

  static normalizePolicy(input: any, _randomizationSeed?: string, durationMinutes?: number | null): WebcamEvidencePolicy {
    const source = input && typeof input === 'object' ? input : {};
    const enabled = Boolean(source.enabled) && String(source.examProfile || '').toUpperCase() === 'THEORY';
    const durationMs = Number(durationMinutes) > 0 ? Number(durationMinutes) * 60_000 : null;

    const rawIntervalSeconds = Number(source.scheduledCaptureIntervalSeconds);
    const scheduledCaptureIntervalSeconds =
      rawIntervalSeconds > 0 ? Math.max(MIN_SCHEDULED_CAPTURE_INTERVAL_SECONDS, Math.round(rawIntervalSeconds)) : null;

    const scheduledCaptureOffsetsMs = (() => {
      if (!durationMs) return [];
      if (scheduledCaptureIntervalSeconds) {
        return buildIntervalOffsets(durationMs, scheduledCaptureIntervalSeconds * 1_000);
      }
      return SCHEDULED_CAPTURE_PERCENTAGES.map((pct) => Math.round(durationMs * pct));
    })();

    const rawMouseIdleThresholdMs = Number(source.mouseIdleThresholdMs);
    const mouseIdleThresholdMs =
      rawMouseIdleThresholdMs > 0
        ? Math.max(MIN_MOUSE_IDLE_THRESHOLD_MS, Math.round(rawMouseIdleThresholdMs))
        : DEFAULT_MOUSE_IDLE_THRESHOLD_MS;

    return {
      enabled,
      examProfile: String(source.examProfile || 'MIXED').toUpperCase() as WebcamEvidencePolicy['examProfile'],
      scheduledCaptureIntervalSeconds,
      scheduledCaptureOffsetsMs,
      eventCooldownMs: Math.max(MIN_EVENT_COOLDOWN_MS, Number(source.eventCooldownMs) || DEFAULT_POLICY.eventCooldownMs),
      mouseIdleThresholdMs,
      retentionDays: 30,
      consentVersion: String(source.consentVersion || DEFAULT_POLICY.consentVersion),
      requireFullScreenCapture: Boolean(source.requireFullScreenCapture),
      screenCaptureEnabled: Boolean(source.screenCaptureEnabled),
    };
  }

  private async getStudentSubmission(submissionId: string, studentId: string) {
    const submission = await this.prisma.examSubmission.findUnique({
      where: { id: submissionId },
      include: { examInstance: true },
    });
    if (!submission) throw new NotFoundException('Không tìm thấy lượt làm bài');
    if (submission.studentId !== studentId) throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này');
    if (!submission.examInstance) throw new BadRequestException('Không có phiên bài thi khả dụng');
    return submission;
  }

  private policyFromInstance(instance: any): WebcamEvidencePolicy {
    return ProctoringEvidenceService.normalizePolicy(
      instance?.snapshotPayload?.webcamEvidencePolicy,
      instance?.randomizationSeed,
      instance?.snapshotPayload?.timeLimitMinutes,
    );
  }

  async requestCapture(submissionId: string, studentId: string, dto: { trigger: 'SCHEDULED' | 'SUSPICIOUS_EVENT'; signals?: string[]; final?: boolean }) {
    const submission = await this.getStudentSubmission(submissionId, studentId);
    if (submission.status !== 'IN_PROGRESS') throw new BadRequestException('Bài thi không còn đang diễn ra');
    const policy = this.policyFromInstance(submission.examInstance);
    if (!policy.enabled) throw new ForbiddenException('Bài thi này không bật yêu cầu bằng chứng webcam');
    const now = new Date();
    let scheduledSlot: number | null = null;
    let scheduledAt: Date | null = null;

    if (dto.trigger === 'SCHEDULED') {
      const startedAt = submission.startedAt || submission.examInstance?.startedAt;
      if (!startedAt || policy.scheduledCaptureOffsetsMs.length === 0) {
        throw new BadRequestException('Không có lịch chụp webcam nào cho phiên bài thi này');
      }
      const elapsedMs = now.getTime() - startedAt.getTime();
      const missedSlots = policy.scheduledCaptureOffsetsMs
        .map((offset, slot) => ({ offset, slot }))
        .filter(({ offset }) => elapsedMs > offset + SCHEDULED_CAPTURE_GRACE_MS);
      if (missedSlots.length > 0) {
        await this.prisma.proctoringEvidenceCapture.createMany({
          data: missedSlots.map(({ offset, slot }) => ({
            submissionId,
            examInstanceId: submission.examInstanceId!,
            trigger: 'SCHEDULED',
            captureSource: 'WEBCAM',
            triggerDetails: { outcome: 'MISSED', scheduledOffsetMs: offset },
            scheduledSlot: slot,
            scheduledAt: new Date(startedAt.getTime() + offset),
            captureNonceHash: createHash('sha256').update(`missed:${submissionId}:${slot}`).digest('hex'),
            nonceExpiresAt: now,
            retentionUntil: new Date(now.getTime() + policy.retentionDays * 86_400_000),
            status: 'FAILED',
          })),
          skipDuplicates: true,
        });
      }
      if (dto.final) {
        // Guaranteed end-of-exam capture requested right at submission time
        // (see ExamTaking.tsx doSubmit) — always targets the last configured
        // checkpoint instead of requiring elapsed time to land inside its
        // normal grace window, since a student who submits early (rather
        // than running out the clock) almost never does. Duplicate-safe: if
        // the normal polling path already captured this slot, reject instead
        // of inserting a second row for the same slot.
        const lastSlot = policy.scheduledCaptureOffsetsMs.length - 1;
        const alreadyCaptured = await this.prisma.proctoringEvidenceCapture.findFirst({
          where: { submissionId, scheduledSlot: lastSlot, captureSource: 'WEBCAM' },
        });
        if (alreadyCaptured) throw new BadRequestException('Ảnh cuối bài thi đã được ghi nhận');
        scheduledSlot = lastSlot;
        scheduledAt = now;
      } else {
        // Grace windows overlap whenever the interval is smaller than
        // SCHEDULED_CAPTURE_GRACE_MS (90s) — e.g. a 10s interval keeps up to
        // 9 offsets simultaneously "in window" at once. Without excluding
        // already-captured slots, .find() below would keep re-resolving to
        // the same earliest (already-done) slot for the entire 90s its
        // window stays open, so every capture attempt in between fails on
        // the (submissionId, scheduledSlot) unique index instead of ever
        // reaching the next slot — the schedule would only ever advance
        // once per ~90s no matter how short the configured interval is.
        const capturedSlots = await this.prisma.proctoringEvidenceCapture.findMany({
          where: { submissionId, trigger: 'SCHEDULED', captureSource: 'WEBCAM' },
          select: { scheduledSlot: true },
        });
        const capturedSlotSet = new Set(capturedSlots.map((c) => c.scheduledSlot));
        const next = policy.scheduledCaptureOffsetsMs
          .map((offset, slot) => ({ offset, slot }))
          .find(({ offset, slot }) => !capturedSlotSet.has(slot) && elapsedMs >= offset && elapsedMs <= offset + SCHEDULED_CAPTURE_GRACE_MS);
        if (!next) throw new BadRequestException('Chưa đến thời điểm chụp webcam theo lịch');
        scheduledSlot = next.slot;
        scheduledAt = new Date(startedAt.getTime() + next.offset);
      }
    } else {
      // No cap on how many times a given signal type can trigger a capture —
      // every suspicious event should be captured. Only a short cooldown
      // (policy.eventCooldownMs) throttles back-to-back captures of the same
      // signal so one burst of events doesn't spam dozens of near-identical
      // photos.
      const signalType = (dto.signals || []).find((signal) => KNOWN_SIGNAL_SLUGS.includes(signal));
      // Filtering by triggerDetails.signals is done in application code, not
      // via Prisma's JSON `path`/`array_contains` filter: that filter compiles
      // to MySQL-only JSON functions and throws at the DB layer on MariaDB
      // (this project's local/EC2 database), which stores JSON as TEXT.
      const recentEventsForSubmission = await this.prisma.proctoringEvidenceCapture.findMany({
        where: { submissionId, trigger: 'SUSPICIOUS_EVENT', captureSource: 'WEBCAM', status: { not: 'PURGED' } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      const mostRecentForSignal = signalType
        ? recentEventsForSubmission.find((event) => {
            const signals = (event.triggerDetails as { signals?: unknown[] } | null)?.signals;
            return Array.isArray(signals) && signals.includes(signalType);
          })
        : recentEventsForSubmission[0];
      if (mostRecentForSignal && now.getTime() - mostRecentForSignal.createdAt.getTime() < policy.eventCooldownMs) {
        throw new BadRequestException('Đang trong thời gian chờ giữa các lần ghi bằng chứng sự kiện nghi vấn');
      }
    }

    const nonce = randomUUID();
    const triggerDetails = { signals: (dto.signals || []).slice(0, 10) };
    const retentionUntil = new Date(now.getTime() + policy.retentionDays * 86_400_000);
    const capture = await this.prisma.proctoringEvidenceCapture.create({
      data: {
        submissionId,
        examInstanceId: submission.examInstanceId!,
        trigger: dto.trigger,
        captureSource: 'WEBCAM',
        triggerDetails,
        scheduledSlot,
        scheduledAt,
        captureNonceHash: createHash('sha256').update(nonce).digest('hex'),
        nonceExpiresAt: new Date(now.getTime() + 60_000),
        retentionUntil,
      },
      select: { id: true, nonceExpiresAt: true },
    });
    const result: { captureId: string; nonce: string; expiresAt: Date; maxBytes: number; screen?: { captureId: string; nonce: string; expiresAt: Date; maxBytes: number } } = {
      captureId: capture.id, nonce, expiresAt: capture.nonceExpiresAt, maxBytes: 1_000_000,
    };

    // One trigger (event or scheduled slot) yields one webcam permit plus, when
    // the policy requires it, one paired screen permit — same trigger/signals,
    // separate nonce/captureId so each stream is captured and finalized on its
    // own. Paired together in listForInstructor by scheduledSlot (SCHEDULED) or
    // timestamp proximity (SUSPICIOUS_EVENT).
    if (policy.screenCaptureEnabled) {
      const screenNonce = randomUUID();
      const screenCapture = await this.prisma.proctoringEvidenceCapture.create({
        data: {
          submissionId,
          examInstanceId: submission.examInstanceId!,
          trigger: dto.trigger,
          captureSource: 'SCREEN',
          triggerDetails,
          scheduledSlot,
          scheduledAt,
          captureNonceHash: createHash('sha256').update(screenNonce).digest('hex'),
          nonceExpiresAt: new Date(now.getTime() + 60_000),
          retentionUntil,
        },
        select: { id: true, nonceExpiresAt: true },
      });
      result.screen = { captureId: screenCapture.id, nonce: screenNonce, expiresAt: screenCapture.nonceExpiresAt, maxBytes: 1_000_000 };
    }

    return result;
  }

  async finalizeCapture(submissionId: string, studentId: string, captureId: string, nonce: string, imageDataUrl: string) {
    const submission = await this.getStudentSubmission(submissionId, studentId);
    const capture = await this.prisma.proctoringEvidenceCapture.findFirst({ where: { id: captureId, submissionId } });
    if (!capture) throw new NotFoundException('Không tìm thấy yêu cầu chụp bằng chứng');
    if (capture.status !== 'REQUESTED' || capture.nonceExpiresAt < new Date()) throw new BadRequestException('Yêu cầu chụp bằng chứng đã hết hạn');
    if (createHash('sha256').update(nonce).digest('hex') !== capture.captureNonceHash) throw new ForbiddenException('Mã xác thực chụp ảnh không hợp lệ');

    const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(imageDataUrl);
    if (!match) throw new BadRequestException('Chỉ chấp nhận ảnh webcam định dạng JPEG hoặc PNG');
    const image = Buffer.from(match[2], 'base64');
    if (!image.length || image.length > 1_000_000) throw new BadRequestException('Ảnh webcam không được vượt quá 1 MB');

    const extension = match[1] === 'image/png' ? 'png' : 'jpg';
    // Ordinal excludes this capture (still status REQUESTED at this point),
    // so it reflects how many captures for this submission were already
    // finalized before it — stable and race-safe enough for a display name.
    const priorFinalized = await this.prisma.proctoringEvidenceCapture.count({
      where: { submissionId, status: { in: ['UPLOADED', 'ANALYZING', 'ANALYZED', 'FAILED'] } },
    });
    const storageKey = buildEvidenceStorageKey({
      examId: submission.examId,
      submissionId,
      trigger: capture.trigger,
      triggerDetails: capture.triggerDetails,
      captureSource: capture.captureSource,
      ordinal: priorFinalized + 1,
      extension,
    });
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, Body: image, ContentType: match[1] }));

    await this.prisma.proctoringEvidenceCapture.update({
      where: { id: capture.id },
      data: {
        status: 'UPLOADED', storageKey, mimeType: match[1], sizeBytes: image.length,
        contentHash: createHash('sha256').update(image).digest('hex'), capturedAt: new Date(),
      },
    });
    try {
      const job = await this.prisma.aIGenerationRecord.create({
        data: {
          submissionId,
          section: 'RISK_ASSESSMENT',
          provider: process.env.AI_PROVIDER || 'google',
          prompt: { task: 'proctoring-evidence', captureId: capture.id },
        },
      });
      await this.queueService.enqueueAiGeneration({ jobId: job.id, task: 'proctoring-evidence', payload: { captureId: capture.id } });
    } catch {
      // Evidence is still reviewable if the queue is temporarily unavailable.
    }
    return { id: capture.id, status: 'UPLOADED' };
  }

  async listForInstructor(submissionId: string, user: any) {
    const submission = await this.prisma.examSubmission.findUnique({ where: { id: submissionId }, select: { examId: true } });
    if (!submission) throw new NotFoundException('Không tìm thấy lượt làm bài');
    await this.accessPolicy.assertInstructorCanAccessExam(submission.examId, user);
    return this.prisma.proctoringEvidenceCapture.findMany({
      where: { submissionId }, orderBy: { createdAt: 'asc' },
      select: { id: true, status: true, trigger: true, captureSource: true, triggerDetails: true, scheduledSlot: true, scheduledAt: true, aiTags: true, aiProvider: true, aiAnalyzedAt: true, aiError: true, reviewStatus: true, reviewerNote: true, reviewedAt: true, capturedAt: true, retentionUntil: true, purgedAt: true, createdAt: true },
    });
  }

  async getImageStream(submissionId: string, captureId: string, user: any): Promise<{ stream: Readable; mimeType: string }> {
    const capture = await this.prisma.proctoringEvidenceCapture.findFirst({ where: { id: captureId, submissionId }, include: { submission: { select: { examId: true } } } });
    if (!capture || !capture.storageKey || capture.status === 'PURGED') throw new NotFoundException('Không có ảnh bằng chứng');
    await this.accessPolicy.assertInstructorCanAccessExam(capture.submission.examId, user);
    const object = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: capture.storageKey }));
    if (!object.Body) throw new NotFoundException('Không có ảnh bằng chứng');
    return { stream: object.Body as Readable, mimeType: capture.mimeType || 'image/jpeg' };
  }

  async reviewCapture(submissionId: string, captureId: string, dto: { reviewStatus: 'REVIEWED' | 'DISMISSED'; reviewerNote?: string }, user: any) {
    const capture = await this.prisma.proctoringEvidenceCapture.findFirst({ where: { id: captureId, submissionId }, include: { submission: { select: { examId: true } } } });
    if (!capture) throw new NotFoundException('Không tìm thấy bản chụp bằng chứng');
    await this.accessPolicy.assertInstructorCanAccessExam(capture.submission.examId, user);
    return this.prisma.proctoringEvidenceCapture.update({ where: { id: captureId }, data: { reviewStatus: dto.reviewStatus, reviewerNote: dto.reviewerNote || null, reviewedById: user.id, reviewedAt: new Date() } });
  }

  // Lets a lecturer/admin retry AI analysis for one capture — needed because
  // a capture that failed (e.g. the AI provider had no vision support
  // configured at the time) is never retried automatically; the queue only
  // enqueues this job once, right after upload, in finalizeCapture above.
  async reanalyzeCapture(submissionId: string, captureId: string, user: any) {
    const capture = await this.prisma.proctoringEvidenceCapture.findFirst({ where: { id: captureId, submissionId }, include: { submission: { select: { examId: true } } } });
    if (!capture) throw new NotFoundException('Không tìm thấy bản chụp bằng chứng');
    await this.accessPolicy.assertInstructorCanAccessExam(capture.submission.examId, user);
    if (!capture.storageKey || capture.status === 'PURGED') throw new BadRequestException('Ảnh bằng chứng không còn khả dụng để phân tích lại');
    await this.prisma.proctoringEvidenceCapture.update({ where: { id: captureId }, data: { status: 'ANALYZING', aiError: null } });
    const job = await this.prisma.aIGenerationRecord.create({
      data: {
        submissionId,
        section: 'RISK_ASSESSMENT',
        provider: process.env.AI_PROVIDER || 'google',
        prompt: { task: 'proctoring-evidence', captureId },
      },
    });
    await this.queueService.enqueueAiGeneration({ jobId: job.id, task: 'proctoring-evidence', payload: { captureId } });
    return { id: captureId, status: 'ANALYZING' };
  }

  async purgeExpired(): Promise<number> {
    const captures = await this.prisma.proctoringEvidenceCapture.findMany({ where: { retentionUntil: { lte: new Date() }, status: { not: 'PURGED' } }, select: { id: true, storageKey: true } });
    for (const capture of captures) {
      if (capture.storageKey) {
        try {
          await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: capture.storageKey }));
        } catch {
          // Retention purge must still clear the DB row even if the R2 delete fails.
        }
      }
    }
    if (captures.length > 0) {
      await this.prisma.proctoringEvidenceCapture.updateMany({
        where: { id: { in: captures.map((c) => c.id) } },
        data: { status: 'PURGED', storageKey: null, contentHash: null, mimeType: null, sizeBytes: null, purgedAt: new Date() },
      });
    }
    return captures.length;
  }

  async readCaptureForAi(captureId: string) {
    const capture = await this.prisma.proctoringEvidenceCapture.findUnique({ where: { id: captureId } });
    if (!capture?.storageKey || capture.status === 'PURGED') throw new NotFoundException('Không có ảnh bằng chứng');
    const object = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: capture.storageKey }));
    if (!object.Body) throw new NotFoundException('Không có ảnh bằng chứng');
    const image = Buffer.from(await object.Body.transformToByteArray());
    return { capture, image };
  }
}
