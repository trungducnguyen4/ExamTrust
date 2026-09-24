import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../../ai/ai.service';
import { EmbeddingService } from '../../ai/embedding.service';
import { AiTelemetryService } from '../../ai/telemetry.service';
import { AISection } from '../../questions-v2/dto/question-draft.dto';
import { ExamTrustAiContext } from '../../ai/ai-profile';

type AiTaskType = 'single-question' | 'exam-questions' | 'draft-section' | 'exam-quality-review' | 'exam-risk-assessment' | 'question-improvement' | 'proctoring-evidence' | 'question-duplicate-analysis';

@Processor('ai-generation')
export class AIGenerationProcessor {
  private readonly logger = new Logger(AIGenerationProcessor.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly embeddingService: EmbeddingService;
  private readonly telemetryService: AiTelemetryService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly config: ConfigService,
    embeddingService?: EmbeddingService,
    telemetryService?: AiTelemetryService,
  ) {
    this.embeddingService = embeddingService || new EmbeddingService(this.config);
    this.telemetryService = telemetryService || new AiTelemetryService();
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

  private normalizeDifficulty(input: any): number {
    const value = Number(input);
    if (Number.isNaN(value)) return 0.5;
    if (value > 1) {
      return Math.max(0, Math.min(1, (value - 1) / 4));
    }
    return Math.max(0, Math.min(1, value));
  }

  private parseJson<T = any>(value: any, fallback: T): T {
    if (value === null || typeof value === 'undefined') return fallback;
    if (typeof value === 'object') return value as T;
    try {
      return JSON.parse(String(value)) as T;
    } catch {
      return fallback;
    }
  }

  buildDraftPrompt(section: AISection, state: any, instruction?: string, constraints?: any) {
    const questionType = String(state?.intent?.questionType || state?.content?.type || 'MULTIPLE_CHOICE').toUpperCase();
    const content = String(state?.content?.content || state?.content?.stem || '').trim();

    const constraintLines: string[] = [];
    if (Array.isArray(constraints?.forbiddenTerms) && constraints.forbiddenTerms.length > 0) {
      constraintLines.push(`Forbidden terms to avoid: ${constraints.forbiddenTerms.join(', ')}`);
    }
    if (constraints?.maxLength && Number(constraints.maxLength) > 0) {
      constraintLines.push(`Maximum question length: ${constraints.maxLength} characters`);
    }

    const head = [
      `Question type: ${questionType}`,
      content ? `Current stem: ${content}` : 'Current stem: not provided',
      instruction ? `Additional instruction: ${instruction}` : '',
      constraintLines.length > 0 ? `Constraints:\n- ${constraintLines.join('\n- ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    if (section === AISection.CONTENT) {
      return `${head}\nGenerate a better question stem.`;
    }
    if (section === AISection.ANSWERS) {
      return `${head}\nGenerate answer options and correct answer.`;
    }
    if (section === AISection.EXPLANATION) {
      return `${head}\nGenerate explanation for the correct answer.`;
    }
    return `${head}\nSuggest classification metadata: topic and learning objective.`;
  }

  private async buildContext(task: AiTaskType, payload: Record<string, any>): Promise<ExamTrustAiContext> {
    const baseContext: ExamTrustAiContext = {
      ...(this.parseJson(payload.context, {}) as Record<string, any>),
    };

    const courseId = String(payload.courseId || baseContext.courseId || '').trim() || null;
    const questionVersionId = String(payload.questionVersionId || baseContext.questionVersionId || '').trim() || null;
    const draftId = String(payload.draftId || baseContext.draftId || '').trim() || null;
    const examId = String(payload.examId || baseContext.examId || '').trim() || null;

    if (courseId) {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true, code: true, name: true },
      });
      if (course) {
        baseContext.courseId = course.id;
        baseContext.courseCode = course.code;
        baseContext.courseName = course.name;
      }
    }

    if (questionVersionId) {
      const version = await this.prisma.questionVersion.findUnique({
        where: { id: questionVersionId },
        select: {
          id: true,
          versionNo: true,
          questionId: true,
          stem: true,
          difficulty: true,
          points: true,
          question: {
            select: {
              id: true,
              type: true,
              courseId: true,
              course: {
                select: { id: true, code: true, name: true },
              },
            },
          },
        },
      });

      if (version) {
        baseContext.questionVersionId = version.id;
        baseContext.questionVersionNo = version.versionNo;
        baseContext.questionId = version.questionId;
        baseContext.currentStem = version.stem || baseContext.currentStem;
        baseContext.questionType = version.question?.type || baseContext.questionType;
        if (version.question?.course) {
          baseContext.courseId = version.question.course.id;
          baseContext.courseCode = version.question.course.code;
          baseContext.courseName = version.question.course.name;
        }
      }
    }

    if (draftId) {
      const draft = await this.prisma.questionDraft.findUnique({
        where: { id: draftId },
        select: {
          id: true,
          questionId: true,
          mode: true,
          currentStep: true,
          state: true,
          question: {
            select: {
              id: true,
              type: true,
              courseId: true,
              course: {
                select: { id: true, code: true, name: true },
              },
            },
          },
        },
      });

      if (draft) {
        baseContext.draftId = draft.id;
        baseContext.draftMode = draft.mode;
        baseContext.draftStep = draft.currentStep;
        if (draft.questionId) {
          baseContext.questionId = draft.questionId;
        }
        if (draft.question?.type) {
          baseContext.questionType = draft.question.type;
        }
        if (draft.question?.course) {
          baseContext.courseId = draft.question.course.id;
          baseContext.courseCode = draft.question.course.code;
          baseContext.courseName = draft.question.course.name;
        }

        const state = this.parseJson<any>(draft.state, {});
        const currentStem = String(state?.content?.content || state?.content?.stem || '').trim();
        if (currentStem) {
          baseContext.currentStem = currentStem;
        }
      }
    }

    if (examId) {
      const exam = await this.prisma.exam.findUnique({
        where: { id: examId },
        select: {
          id: true,
          title: true,
          mode: true,
          status: true,
          course: {
            select: { id: true, code: true, name: true },
          },
        },
      });

      if (exam) {
        baseContext.examId = exam.id;
        baseContext.examTitle = exam.title;
        baseContext.examMode = String(exam.mode);
        baseContext.examStatus = exam.status;
        if (exam.course) {
          baseContext.courseId = exam.course.id;
          baseContext.courseCode = exam.course.code;
          baseContext.courseName = exam.course.name;
        }
      }
    }

    if (typeof payload.questionType !== 'undefined') {
      baseContext.questionType = String(payload.questionType);
    }
    if (typeof payload.questionCount !== 'undefined') {
      baseContext.questionCount = Number(payload.questionCount);
    }
    if (typeof payload.difficulty !== 'undefined') {
      baseContext.difficulty = this.normalizeDifficulty(payload.difficulty);
    }
    if (typeof payload.attemptNo !== 'undefined') {
      baseContext.attemptNo = Number(payload.attemptNo);
    }
    if (typeof payload.topicName !== 'undefined') {
      baseContext.topicName = String(payload.topicName);
    }
    if (typeof payload.instruction !== 'undefined') {
      baseContext.instruction = String(payload.instruction);
    }
    if (Array.isArray(payload.existingTopics)) {
      baseContext.existingTopics = payload.existingTopics.map((topic: any) => String(topic || '').trim()).filter(Boolean);
    }
    if (payload.analytics) {
      baseContext.analytics = payload.analytics;
    }

    if (task === 'draft-section') {
      baseContext.extra = {
        ...(baseContext.extra || {}),
        section: payload.section || 'CONTENT',
      };
    }

    return baseContext;
  }

  @Process({ concurrency: 5 })
  async process(job: Job<any>): Promise<void> {
    const { jobId, task, payload } = job.data as {
      jobId: string;
      task: AiTaskType;
      payload: Record<string, any>;
    };

    // ai-worker runs as a separate process from the `app` API server, each
    // with its own in-memory AiService instance — a provider switch made via
    // the `app` process's HTTP endpoint never reaches this one directly.
    // Re-sync from Redis before every job so the worker actually uses the
    // currently active provider, not whatever it had at its own last boot.
    await this.aiService.syncProviderFromRedis();

    const record = await this.prisma.aIGenerationRecord.findUnique({
      where: { id: jobId },
      select: { id: true, status: true },
    });

    if (!record) {
      this.logger.warn(`AI job record not found: ${jobId}`);
      return;
    }

    await this.prisma.aIGenerationRecord.update({
      where: { id: jobId },
      data: {
        status: 'RUNNING',
        errorMessage: null,
      },
    });

    try {
      const startTime = Date.now();
      if (task === 'question-duplicate-analysis') {
        const questionIds = Array.isArray(payload.questionIds) ? payload.questionIds.map(String) : [];
        const questions = await this.prisma.question.findMany({
          where: { courseId: String(payload.courseId || ''), status: 'PUBLISHED' },
          select: {
            id: true, type: true, content: true, options: true, correctAnswer: true, explanation: true, difficulty: true,
            course: { select: { code: true, name: true, description: true } },
            topicLinks: { select: { topic: { select: { name: true } } } },
          },
        });
        const references = questionIds.map((id) => questions.find((question) => question.id === id)).filter(Boolean) as any[];
        const referenceIds = new Set(references.map((question) => question.id));
        const targets = questions.filter((question) => !referenceIds.has(question.id));
        const totalPairs = references.length * targets.length;

        // High-speed vector embeddings & cosine similarity (< 50ms) replacing O(N*M) sequential LLM calls
        const candidates = await this.embeddingService.findDuplicateCandidates(
          references,
          targets,
          { similarityThreshold: 0.85, semanticThreshold: 0.70 },
        );

        const pairs = candidates.map((c) => ({
          questionA: c.questionA,
          questionB: c.questionB,
          relation: c.relation,
          confidence: c.similarity,
          similarityPercent: Math.round(c.similarity * 100),
          matchMethod: c.matchMethod === 'EXACT' ? 'EXACT' : 'AI',
          reason: c.reason,
          diagnostics: c.diagnostics,
        }));

        const duplicateCandidates = pairs.filter(
          (p) => p.relation === 'EXACT_DUPLICATE' || p.relation === 'SEMANTIC_DUPLICATE' || p.similarityPercent >= 70,
        ).length;

        const telemetry = this.telemetryService.generateTelemetry({
          provider: 'local-vector',
          model: 'examtrust-vector-hash-512',
          promptText: `duplicate-analysis:${references.length}x${targets.length}`,
          completionText: JSON.stringify(pairs),
          latencyMs: Date.now() - startTime,
          task: 'question-duplicate-analysis',
        });

        await job.progress(100);
        await this.prisma.aIGenerationRecord.update({
          where: { id: jobId },
          data: {
            status: 'SUCCEEDED',
            output: {
              totalPairs,
              processedPairs: totalPairs,
              progress: 100,
              duplicateCandidates,
              pairs,
              telemetry,
            },
            completedAt: new Date(),
          },
        });
        return;
      }

      if (task === 'proctoring-evidence') {
        const captureId = String(payload.captureId || '');
        const capture = await this.prisma.proctoringEvidenceCapture.findUnique({ where: { id: captureId } });
        if (!capture?.storageKey || capture.status === 'PURGED') throw new Error('Không có ảnh bằng chứng');
        await this.prisma.proctoringEvidenceCapture.update({ where: { id: capture.id }, data: { status: 'ANALYZING', aiError: null } });
        const object = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: capture.storageKey }));
        if (!object.Body) throw new Error('Không có ảnh bằng chứng');
        const image = Buffer.from(await object.Body.transformToByteArray());
        const result = await this.aiService.analyzeProctoringImage({ image, mimeType: capture.mimeType || 'image/jpeg' });
        const provider = process.env.AI_PROVIDER || 'google';
        const model = result.model ? `${provider}:${result.model}` : provider;
        const telemetry = this.telemetryService.generateTelemetry({
          provider,
          model: result.model || provider,
          promptText: `image-bytes:${image.length}`,
          completionText: JSON.stringify(result),
          latencyMs: Date.now() - startTime,
          task: 'proctoring-evidence',
        });
        await this.prisma.proctoringEvidenceCapture.update({ where: { id: capture.id }, data: { status: 'ANALYZED', aiTags: result.tags, aiProvider: model, aiAnalyzedAt: new Date() } });
        await this.prisma.aIGenerationRecord.update({
          where: { id: jobId },
          data: {
            status: 'SUCCEEDED',
            model: result.model || undefined,
            output: {
              ...result,
              telemetry,
            },
            completedAt: new Date(),
          },
        });
        return;
      }
      const context = await this.buildContext(task, payload);

      if (task === 'single-question') {
        let promptText = String(payload.prompt || '');
        const constraintsList: string[] = [];
        if (Array.isArray(payload.constraints?.forbiddenTerms) && payload.constraints.forbiddenTerms.length > 0) {
          constraintsList.push(`Forbidden terms to avoid: ${payload.constraints.forbiddenTerms.join(', ')}`);
        }
        if (payload.constraints?.maxLength && Number(payload.constraints.maxLength) > 0) {
          constraintsList.push(`Maximum question length: ${payload.constraints.maxLength} characters`);
        }
        if (constraintsList.length > 0) {
          promptText = `${promptText}\nConstraints:\n- ${constraintsList.join('\n- ')}`;
        }

        const result = await this.aiService.generateQuestion({
          prompt: promptText,
          questionType: payload.questionType,
          difficulty: this.normalizeDifficulty(payload.difficulty),
          language: payload.language,
          courseName: payload.courseName,
          useCase: payload.useCase,
          context,
        });

        const telemetry = this.telemetryService.generateTelemetry({
          provider: process.env.AI_PROVIDER || 'google',
          promptText,
          completionText: JSON.stringify(result),
          latencyMs: Date.now() - startTime,
          task: 'single-question',
        });

        await this.prisma.aIGenerationRecord.update({
          where: { id: jobId },
          data: {
            status: 'SUCCEEDED',
            output: {
              ...result,
              telemetry,
            },
            completedAt: new Date(),
          },
        });
        return;
      }

      if (task === 'exam-questions') {
        const questions = await this.aiService.generateExamQuestions({
          prompt: String(payload.prompt || ''),
          questionCount: Number(payload.questionCount || 1),
          difficulty: this.normalizeDifficulty(payload.difficulty),
          questionType: payload.questionType,
          language: payload.language,
          courseName: payload.courseName,
          useCase: payload.useCase,
          context,
        });

        const telemetry = this.telemetryService.generateTelemetry({
          provider: process.env.AI_PROVIDER || 'google',
          promptText: String(payload.prompt || ''),
          completionText: JSON.stringify(questions),
          latencyMs: Date.now() - startTime,
          task: 'exam-questions',
        });

        await this.prisma.aIGenerationRecord.update({
          where: { id: jobId },
          data: {
            status: 'SUCCEEDED',
            output: {
              questions,
              telemetry,
            },
            completedAt: new Date(),
          },
        });
        return;
      }

      if (task === 'exam-quality-review') {
        const result = await this.aiService.generateExamQualityReview({
          examTitle: context.examTitle,
          courseName: context.courseName,
          language: payload.language,
          examSummary: payload.examSummary || { totalSubmissions: 0 },
          questionStats: payload.questionStats || [],
          context,
        });

        const telemetry = this.telemetryService.generateTelemetry({
          provider: process.env.AI_PROVIDER || 'google',
          promptText: `exam-quality-review:${context.examTitle || ''}`,
          completionText: JSON.stringify(result),
          latencyMs: Date.now() - startTime,
          task: 'exam-quality-review',
        });

        await this.prisma.$transaction([
          this.prisma.aIGenerationRecord.update({
            where: { id: jobId },
            data: {
              status: 'SUCCEEDED',
              output: {
                ...result,
                telemetry,
              },
              completedAt: new Date(),
            },
          }),
          ...result.suggestions.map((s) => {
            const stat = (payload.questionStats || []).find(
              (q: any) => q.questionId === s.questionId,
            );
            return this.prisma.examQualityReviewItem.create({
              data: {
                jobId,
                questionId: s.questionId,
                questionVersionId: stat?.questionVersionId ?? null,
                severity: s.severity,
                reasonSummary: s.reasonSummary,
                recommendation: s.recommendation,
                statsSnapshot: stat ?? {},
              },
            });
          }),
        ]);
        return;
      }

      if (task === 'exam-risk-assessment') {
        const result = await this.aiService.assessExamIntegrityRisk({
          examTitle: context.examTitle,
          courseName: context.courseName,
          language: payload.language,
          submissionSummary: payload.submissionSummary || {},
          signals: payload.signals || {
            tabSwitchCount: 0,
            mouseAnomalies: 0,
            fullscreenExitCount: 0,
            focusLossCount: 0,
            pageHiddenCount: 0,
            tooFastAnswerCount: 0,
            totalAnswers: 0,
            totalIntegrityEvents: 0,
            eventBreakdown: {},
          },
          context,
        });

        const telemetry = this.telemetryService.generateTelemetry({
          provider: process.env.AI_PROVIDER || 'google',
          promptText: `exam-risk-assessment:${context.examTitle || ''}`,
          completionText: JSON.stringify(result),
          latencyMs: Date.now() - startTime,
          task: 'exam-risk-assessment',
        });

        await this.prisma.aIGenerationRecord.update({
          where: { id: jobId },
          data: {
            status: 'SUCCEEDED',
            output: {
              ...result,
              telemetry,
            },
            completedAt: new Date(),
          },
        });

        const examInstanceId = payload.examInstanceId || null;
        if (examInstanceId) {
          await this.prisma.anomalyFlag.create({
            data: {
              examInstanceId,
              jobId,
              kind: 'AI_RISK_ASSESSMENT',
              score: result.riskScore,
              status: 'OPEN',
            },
          });
        }
        return;
      }

      if (task === 'question-improvement') {
        const result = await this.aiService.generateQuestionImprovement({
          language: payload.language,
          instruction: payload.instruction,
          context: {
            ...context,
            ...(payload.context || {}),
          },
          original: payload.original || {},
          analytics: payload.analytics || {},
          qualitySignals: payload.qualitySignals || [],
        });

        const telemetry = this.telemetryService.generateTelemetry({
          provider: process.env.AI_PROVIDER || 'google',
          promptText: `question-improvement:${payload.instruction || ''}`,
          completionText: JSON.stringify(result),
          latencyMs: Date.now() - startTime,
          task: 'question-improvement',
        });

        await this.prisma.aIGenerationRecord.update({
          where: { id: jobId },
          data: {
            status: 'SUCCEEDED',
            output: {
              ...result,
              draft: result.suggestion,
              telemetry,
            },
            completedAt: new Date(),
          },
        });
        return;
      }

      const section = String(payload.section || 'CONTENT').toUpperCase() as AISection;
      const prompt = this.buildDraftPrompt(section, payload.draftState || {}, payload.instruction, payload.constraints);
      const result = await this.aiService.generateQuestion({
        prompt,
        questionType: String(payload.draftState?.intent?.questionType || 'MULTIPLE_CHOICE'),
        difficulty: this.normalizeDifficulty(payload.constraints?.difficulty ?? 0.5),
        language: payload.constraints?.language || 'en',
        useCase: 'question_bank',
        context,
      });

      const candidates: Array<Record<string, any>> = [];
      if (section === AISection.CONTENT) {
        candidates.push({ id: 'cand-1', content: result.content });
      } else if (section === AISection.ANSWERS) {
        candidates.push({ id: 'cand-1', options: result.options || {}, correctAnswer: result.correctAnswer || {} });
      } else if (section === AISection.EXPLANATION) {
        candidates.push({ id: 'cand-1', explanation: result.explanation || '' });
      } else {
        candidates.push({
          id: 'cand-1',
          topic: result.topic || '',
          learningObjective: result.learningObjective || '',
          difficulty: result.difficulty,
        });
      }

      const telemetry = this.telemetryService.generateTelemetry({
        provider: process.env.AI_PROVIDER || 'google',
        promptText: prompt,
        completionText: JSON.stringify(candidates),
        latencyMs: Date.now() - startTime,
        task: 'draft-section',
      });

      await this.prisma.aIGenerationRecord.update({
        where: { id: jobId },
        data: {
          status: 'SUCCEEDED',
          output: {
            candidates,
            telemetry,
          },
          completedAt: new Date(),
        },
      });
    } catch (error: any) {
      const maxAttempts = job.opts?.attempts || 1;
      const attemptsMade = typeof job.attemptsMade === 'number' ? job.attemptsMade : 0;
      const isNonRetryable = this.isNonRetryableError(error);
      const isFinalAttempt = attemptsMade + 1 >= maxAttempts || isNonRetryable;

      this.logger.error(
        `AI job error [${jobId}] task=${task} (Attempt ${attemptsMade + 1}/${maxAttempts}, final=${isFinalAttempt}): ${error?.message || error}`,
        error?.stack,
      );

      if (isFinalAttempt) {
        if (task === 'proctoring-evidence' && payload?.captureId) {
          await this.prisma.proctoringEvidenceCapture.updateMany({
            where: { id: String(payload.captureId), status: { not: 'PURGED' } },
            data: { status: 'FAILED', aiError: String(error?.message || error).slice(0, 2000) },
          });
        }
        await this.prisma.aIGenerationRecord.update({
          where: { id: jobId },
          data: {
            status: 'FAILED',
            errorMessage: String(error?.message || error),
            completedAt: new Date(),
          },
        });
      } else {
        // Retries remaining: keep status as RUNNING in DB, update interim error log
        await this.prisma.aIGenerationRecord.update({
          where: { id: jobId },
          data: {
            errorMessage: `Attempt ${attemptsMade + 1}/${maxAttempts} failed: ${String(error?.message || error)}. Đang thử lại...`,
          },
        });
      }
      throw error;
    }
  }

  private isNonRetryableError(error: any): boolean {
    const msg = String(error?.message || error || '').toLowerCase();
    return (
      msg.includes('không có ảnh bằng chứng') ||
      msg.includes('job record not found') ||
      msg.includes('dữ liệu không hợp lệ')
    );
  }
}
