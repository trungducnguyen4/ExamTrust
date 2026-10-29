import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AiJobsService } from '../ai/ai-jobs.service';
import { AiService } from '../ai/ai.service';
import { MediaService } from '../media/media.service';
import {
  AIGenerateSectionDto,
  AISection,
  ApplyAICandidateDto,
  CreateQuestionDraftDto,
  DraftPublishMode,
  DraftValidationLevel,
  PublishQuestionDraftDto,
  QuestionDraftStepKey,
  SaveDraftStepDto,
  ValidateQuestionDraftDto,
} from './dto/question-draft.dto';
import { ListQuestionsQueryDto } from './dto/question-v2-query.dto';
import { CreateQuestionCrudDto, UpdateQuestionCrudDto } from './dto/question-crud.dto';
import {
  assertQuestionContentLength,
  assertOptionsLength,
  assertExplanationLength,
  assertLineContent,
} from './question-validation';
import {
  ApproveQuestionAiImprovementDto,
  CreateQuestionAiImprovementDto,
  RejectQuestionAiImprovementDto,
  UpdateQuestionAiImprovementDraftDto,
} from './dto/question-ai-improvement.dto';

interface AuthUser {
  id: string;
  role: 'ADMIN' | 'LECTURER' | 'STUDENT';
}

interface QuestionAccessRow {
  creatorId: string | null;
  courseId: string | null;
}

interface DraftRow {
  id: string;
  questionId: string | null;
  creatorId: string;
  mode: string;
  currentStep: string;
  autosaveVersion: number;
  state: any;
  validation: any;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class QuestionsService {
  private tableCache = new Map<string, boolean>();
  private columnCache = new Map<string, boolean>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiJobsService: AiJobsService,
    private readonly aiService: AiService,
    private readonly mediaService: MediaService,
  ) {}

  private normalizeDuplicateText(value: string) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private lexicalSimilarity(left: string, right: string) {
    const normalizedLeft = this.normalizeDuplicateText(left);
    const normalizedRight = this.normalizeDuplicateText(right);
    if (!normalizedLeft || !normalizedRight) return 0;
    if (normalizedLeft === normalizedRight) return 1;
    if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) return 0.9;
    const leftTokens = new Set(normalizedLeft.split(' '));
    const rightTokens = new Set(normalizedRight.split(' '));
    let overlap = 0;
    leftTokens.forEach((token) => { if (rightTokens.has(token)) overlap += 1; });
    return overlap / Math.max(1, new Set([...leftTokens, ...rightTokens]).size);
  }

  async getDuplicatePreference(user: AuthUser) {
    const rows = await this.prisma.$queryRawUnsafe(
      'SELECT similarityThreshold FROM question_bank_preferences WHERE userId = ? LIMIT 1', user.id,
    ) as Array<{ similarityThreshold: number }>;
    return { similarityThreshold: Math.max(1, Math.min(100, Number(rows[0]?.similarityThreshold || 80))) };
  }

  async updateDuplicatePreference(threshold: number, user: AuthUser) {
    const similarityThreshold = Math.max(1, Math.min(100, Math.round(threshold)));
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO question_bank_preferences (id, userId, similarityThreshold, createdAt, updatedAt)
       VALUES (UUID(), ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE similarityThreshold = VALUES(similarityThreshold), updatedAt = UTC_TIMESTAMP(3)`,
      user.id, similarityThreshold,
    );
    return { similarityThreshold };
  }

  async checkDuplicateQuestions(courseId: string, user: AuthUser) {
    await this.assertCourseAccessible(courseId, user);
    const [course, questions] = await Promise.all([
      this.prisma.course.findUnique({
        where: { id: courseId },
        select: { code: true, name: true, description: true },
      }),
      this.prisma.question.findMany({
      where: { courseId, status: 'PUBLISHED' },
      select: {
        id: true, type: true, content: true, options: true, correctAnswer: true,
        explanation: true, difficulty: true, updatedAt: true,
        topicLinks: { select: { topic: { select: { name: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
      }),
    ]);
    const candidates: Array<{ left: any; right: any; retrievalScore: number; exact: boolean }> = [];
    for (let index = 0; index < questions.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < questions.length; otherIndex += 1) {
        const left = questions[index];
        const right = questions[otherIndex];
        if (left.type !== right.type) continue;
        const lexical = this.lexicalSimilarity(left.content, right.content);
        const leftTopicLinks = left.topicLinks || [];
        const rightTopicLinks = right.topicLinks || [];
        const leftTopics = new Set(leftTopicLinks.map((link: any) => String(link.topic?.name || '').toLocaleLowerCase('vi-VN')));
        const sharesTopic = rightTopicLinks.some((link: any) => leftTopics.has(String(link.topic?.name || '').toLocaleLowerCase('vi-VN')));
        // Lexical/topic signals only retrieve candidates. They never become the
        // duplicate verdict because similar wording may express an opposite task.
        if (lexical >= 0.25 || sharesTopic) {
          candidates.push({ left, right, retrievalScore: Math.min(1, lexical + (sharesTopic ? 0.2 : 0)), exact: lexical === 1 });
        }
      }
    }

    const exactCandidates = candidates.filter((candidate) => candidate.exact);
    // Ollama commonly allows one inference at a time; serialize a bounded
    // ranked candidate set. Pairs outside the set are intentionally not shown
    // as duplicates because retrieval is not a semantic conclusion.
    const aiCandidates = candidates
      .filter((candidate) => !candidate.exact)
      .sort((a, b) => b.retrievalScore - a.retrievalScore)
      .slice(0, 40);
    const matches: any[] = [];
    for (const { left, right } of exactCandidates) {
      matches.push({
        left, right, relation: 'EXACT_DUPLICATE', confidence: 1, matchMethod: 'EXACT',
        reason: 'Nội dung câu hỏi trùng khớp sau khi chuẩn hoá.',
        diagnostics: { sameKnowledgePoint: true, sameCognitiveOperation: true, sameExpectedAnswer: true, differentWording: false },
      });
    }
    for (const { left, right } of aiCandidates) {
      const assessment = await this.aiService.assessQuestionDuplicatePair({
        course: course || {},
        questionA: {
          ...left,
          topics: (left.topicLinks || []).map((link: any) => link.topic?.name).filter(Boolean),
        },
        questionB: {
          ...right,
          topics: (right.topicLinks || []).map((link: any) => link.topic?.name).filter(Boolean),
        },
        language: 'vi',
      });
      // RELATED_ONLY and DISTINCT are ordinary candidate-retrieval outcomes;
      // omit them from the duplicate-review list rather than padding it.
      if (assessment && assessment.relation !== 'RELATED_ONLY' && assessment.relation !== 'DISTINCT') {
        matches.push({ left, right, ...assessment, matchMethod: 'AI' });
      }
    }

    const pairs = matches
      .sort((a, b) => b.confidence - a.confidence)
      .map((item) => ({
        questionA: { id: item.left.id, type: item.left.type, content: item.left.content },
        questionB: { id: item.right.id, type: item.right.type, content: item.right.content },
        // Retained for compatible clients. It is classification confidence,
        // not a percentage of matching words.
        similarityPercent: Number((item.confidence * 100).toFixed(0)),
        relation: item.relation,
        matchMethod: item.matchMethod,
        reason: item.reason,
        diagnostics: item.diagnostics,
      }));
    return { courseId, scannedQuestionCount: questions.length, pairs, aiReviewedPairs: aiCandidates.length };
  }

  async createDuplicateAnalysisJob(courseId: string, questionIds: string[], user: AuthUser) {
    await this.assertCourseAccessible(courseId, user);
    const uniqueQuestionIds = [...new Set(questionIds.map((id) => String(id).trim()).filter(Boolean))];
    if (uniqueQuestionIds.length < 2) throw new BadRequestException('Cần chọn ít nhất 2 câu hỏi để phân tích.');

    const ownedQuestions = await this.prisma.question.count({
      where: { id: { in: uniqueQuestionIds }, courseId, status: 'PUBLISHED' },
    });
    if (ownedQuestions !== uniqueQuestionIds.length) {
      throw new BadRequestException('Danh sách câu hỏi có phần tử không thuộc học phần hoặc chưa được xuất bản.');
    }

    const courseQuestionCount = await this.prisma.question.count({
      where: { courseId, status: 'PUBLISHED' },
    });
    const targetQuestionCount = Math.max(0, courseQuestionCount - uniqueQuestionIds.length);
    const totalPairs = uniqueQuestionIds.length * targetQuestionCount;
    const job = await this.aiJobsService.createJob({
      task: 'question-duplicate-analysis',
      requestedBy: user.id,
      payload: {
        courseId,
        questionIds: uniqueQuestionIds,
        targetQuestionCount,
        totalPairs,
        language: 'vi',
      },
    });
    return { jobId: job.id, status: 'QUEUED', totalPairs, selectedQuestionCount: uniqueQuestionIds.length, targetQuestionCount };
  }

  private parseJson(value: any, fallback: any = null) {
    if (value === null || typeof value === 'undefined') return fallback;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(String(value));
    } catch {
      return fallback;
    }
  }

  private normalizeQuestionType(input?: string) {
    const type = String(input || 'MULTIPLE_CHOICE').trim().toUpperCase();
    const allowed = new Set([
      'MULTIPLE_CHOICE',
      'MULTI_SELECT',
      'TRUE_FALSE',
      'SHORT_ANSWER',
      'ESSAY',
      'FILL_IN_BLANK',
      'MATCHING',
      'ORDERING',
      'FIND_ERROR',
    ]);
    if (allowed.has(type)) return type;
    if (type === 'SINGLE_CHOICE') return 'MULTIPLE_CHOICE';
    return 'MULTIPLE_CHOICE';
  }

  private async hasTable(tableName: string): Promise<boolean> {
    if (this.tableCache.has(tableName)) return this.tableCache.get(tableName)!;
    const rows = await this.prisma.$queryRawUnsafe(
      `SELECT 1 AS ok FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      tableName,
    ) as Array<{ ok: number }>;
    const exists = rows.length > 0;
    this.tableCache.set(tableName, exists);
    return exists;
  }

  private async hasColumn(tableName: string, columnName: string): Promise<boolean> {
    const key = `${tableName}.${columnName}`;
    if (this.columnCache.has(key)) return this.columnCache.get(key)!;

    const rows = await this.prisma.$queryRawUnsafe(
      `SELECT 1 AS ok FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
      tableName,
      columnName,
    ) as Array<{ ok: number }>;

    const exists = rows.length > 0;
    this.columnCache.set(key, exists);
    return exists;
  }

  private async assertCourseAccessible(courseId: string, user: AuthUser) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, lecturerId: true },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    if (user.role === 'LECTURER' && course.lecturerId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền sử dụng khóa học này');
    }
  }

  private assertCanAccessQuestion(question: QuestionAccessRow, user: AuthUser) {
    if (user.role === 'ADMIN') return;
    if (user.role !== 'LECTURER' || question.creatorId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền truy cập câu hỏi này');
    }
  }

  private async assertTopicBelongsToCourse(topicId: string, courseId: string) {
    if (!(await this.hasTable('course_topics'))) {
      throw new BadRequestException('Bảng CourseTopics chưa khả dụng. Vui lòng áp dụng schema phase-01 trước.');
    }

    const rows = await this.prisma.$queryRawUnsafe(
      `SELECT 1 AS ok FROM course_topics WHERE courseId COLLATE utf8mb4_unicode_ci = ? AND topicId COLLATE utf8mb4_unicode_ci = ? LIMIT 1`,
      courseId,
      topicId,
    ) as Array<{ ok: number }>;

    if (rows.length === 0) {
      throw new BadRequestException('Chủ đề đã chọn không thuộc khóa học đã chọn');
    }
  }

  private async syncSingleQuestionTopic(questionId: string, topicId: string) {
    if (!(await this.hasTable('question_topics'))) {
      throw new BadRequestException('Bảng QuestionTopics chưa khả dụng. Vui lòng áp dụng schema phase-01 trước.');
    }

    await this.prisma.$executeRawUnsafe(`DELETE FROM question_topics WHERE questionId = ?`, questionId);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO question_topics (questionId, topicId) VALUES (?, ?)`,
      questionId,
      topicId,
    );
  }

  async createQuestion(dto: CreateQuestionCrudDto, user: AuthUser) {
    const questionData = dto;

    if (questionData.courseId) {
      await this.assertCourseAccessible(questionData.courseId, user);
    } else if (user.role === 'LECTURER') {
      throw new BadRequestException('Cần chọn khóa học đối với câu hỏi do giảng viên tạo');
    }

    const topicId = String(questionData.topicId || '').trim();
    if (!topicId) {
      throw new BadRequestException('Cần chọn chủ đề để tạo câu hỏi');
    }

    if (!questionData.courseId) {
      throw new BadRequestException('Cần chọn khóa học để tạo câu hỏi');
    }

    await this.assertTopicBelongsToCourse(topicId, questionData.courseId);

    // Validate content lengths
    assertQuestionContentLength(questionData.content);
    assertOptionsLength(questionData.options);
    if (questionData.explanation) assertExplanationLength(questionData.explanation);

    // Validate line content for find_error / ordering types
    if (questionData.type === 'FIND_ERROR' || questionData.type === 'ORDERING') {
      assertLineContent(questionData.options);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          type: questionData.type,
          content: questionData.content,
          options: questionData.options,
          correctAnswer: questionData.correctAnswer,
          explanation: questionData.explanation,
          difficulty: questionData.difficulty,
          points: questionData.points,
          // Suggested coefficient only; the effective score belongs to each ExamQuestion.
          defaultPoints: questionData.defaultPoints ?? 1,
          course: questionData.courseId
            ? { connect: { id: questionData.courseId } }
            : undefined,
          creator: { connect: { id: user.id } },
          mediaUrl: questionData.mediaUrl,
          mediaType: questionData.mediaType,
          mediaKey: questionData.mediaKey,
          mediaSizeBytes: questionData.mediaSizeBytes,
        },
      });

      await tx.questionVersion.create({
        data: {
          questionId: question.id,
          versionNo: 1,
          stem: question.content,
          payload: question.options ?? {},
          answerKey: question.correctAnswer ?? {},
          explanation: question.explanation,
          difficulty: question.difficulty,
          points: question.points,
          metadata: { source: 'question-create' },
          aiGenerated: false,
          createdBy: user.id,
        },
      });

      return question;
    });

    await this.syncSingleQuestionTopic(created.id, topicId);

    return created;
  }

  async previewCopyQuestionBank(
    dto: { sourceCourseId: string; targetCourseId: string; questionIds: string[] },
    user: AuthUser,
  ) {
    const { sourceCourseId, targetCourseId, questionIds } = dto;

    if (sourceCourseId === targetCourseId) {
      throw new BadRequestException('Khóa học nguồn và khóa học đích phải khác nhau');
    }

    await this.assertCourseAccessible(sourceCourseId, user);
    await this.assertCourseAccessible(targetCourseId, user);

    const [sourceQuestions, targetQuestions] = await Promise.all([
      this.prisma.question.findMany({
        where: { id: { in: questionIds }, courseId: sourceCourseId },
        select: { id: true, type: true, content: true },
      }),
      this.prisma.question.findMany({
        where: { courseId: targetCourseId, status: 'PUBLISHED' },
        select: { type: true, content: true },
      }),
    ]);

    const duplicateQuestionIds = sourceQuestions
      .filter((question) =>
        targetQuestions.some(
          (target) =>
            target.type === question.type &&
            this.lexicalSimilarity(question.content, target.content) >= 0.85,
        ),
      )
      .map((question) => question.id);

    return { duplicateQuestionIds };
  }

  async copyQuestionBank(
    dto: {
      sourceCourseId: string;
      targetCourseId: string;
      topicIds?: string[];
      questionIds?: string[];
      forceDuplicateIds?: string[];
    },
    user: AuthUser,
  ) {
    const { sourceCourseId, targetCourseId, topicIds, questionIds, forceDuplicateIds } = dto;

    if (sourceCourseId === targetCourseId) {
      throw new BadRequestException('Khóa học nguồn và khóa học đích phải khác nhau');
    }

    await this.assertCourseAccessible(sourceCourseId, user);
    await this.assertCourseAccessible(targetCourseId, user);

    const sourceQuestions = await this.prisma.question.findMany({
      where: { courseId: sourceCourseId, status: 'PUBLISHED' },
      include: { topicLinks: { include: { topic: true } } },
    });

    const filtered = questionIds?.length
      ? sourceQuestions.filter((q) => questionIds.includes(q.id))
      : topicIds?.length
      ? sourceQuestions.filter((q) =>
          q.topicLinks.some((link) => topicIds.includes(link.topicId)),
        )
      : sourceQuestions;

    const forceIds = new Set(forceDuplicateIds || []);
    const topicIdMap = new Map<string, string>();
    let copied = 0;
    let skipped = 0;

    // Batch pre-fetch existing questions in target course to eliminate N+1 findFirst queries
    const existingTargetQuestions = await this.prisma.question.findMany({
      where: { courseId: targetCourseId },
      select: { type: true, content: true },
    });
    const existingKeySet = new Set(
      existingTargetQuestions.map((q) => q.type + ':::' + (q.content || '').trim()),
    );

    for (const question of filtered) {
      const key = question.type + ':::' + (question.content || '').trim();
      if (existingKeySet.has(key) && !forceIds.has(question.id)) {
        skipped += 1;
        continue;
      }
      existingKeySet.add(key);

      const sourceTopic = question.topicLinks[0]?.topic ?? null;
      let targetTopicId: string | null = null;

      if (sourceTopic) {
        targetTopicId = topicIdMap.get(sourceTopic.id) ?? null;
        if (!targetTopicId) {
          const targetTopic = await this.prisma.topic.upsert({
            where: { courseId_code: { courseId: targetCourseId, code: sourceTopic.code } },
            create: { code: sourceTopic.code, name: sourceTopic.name, courseId: targetCourseId },
            update: {},
          });
          await this.prisma.courseTopic.upsert({
            where: { courseId_topicId: { courseId: targetCourseId, topicId: targetTopic.id } },
            create: { courseId: targetCourseId, topicId: targetTopic.id },
            update: {},
          });
          targetTopicId = targetTopic.id;
          topicIdMap.set(sourceTopic.id, targetTopic.id);
        }
      }

      const created = await this.prisma.question.create({
        data: {
          type: question.type,
          content: question.content,
          options: question.options as any,
          correctAnswer: question.correctAnswer as any,
          explanation: question.explanation,
          difficulty: question.difficulty,
          points: question.points,
          defaultPoints: question.defaultPoints,
          course: { connect: { id: targetCourseId } },
          creator: { connect: { id: user.id } },
          status: 'PUBLISHED',
          isReusable: true,
        },
      });

      if (targetTopicId) {
        await this.syncSingleQuestionTopic(created.id, targetTopicId);
      }

      const versionId = randomUUID();
      await this.prisma.$executeRawUnsafe(
        `
        INSERT INTO question_versions (id, questionId, versionNo, stem, payload, answerKey, explanation, difficulty, points, metadata, aiGenerated, createdBy, createdAt)
        VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 0, ?, UTC_TIMESTAMP(3))
        `,
        versionId,
        created.id,
        question.content,
        JSON.stringify(question.options || {}),
        JSON.stringify(question.correctAnswer || {}),
        question.explanation,
        question.difficulty,
        question.points,
        JSON.stringify({ copiedFromQuestionId: question.id, copiedFromCourseId: sourceCourseId }),
        user.id,
      );

      copied += 1;
    }

    return { copied, skipped, total: filtered.length };
  }

  async findQuestionById(id: string, user: AuthUser) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        content: true,
        options: true,
        correctAnswer: true,
        explanation: true,
        difficulty: true,
        points: true,
        defaultPoints: true,
        courseId: true,
        creatorId: true,
        status: true,
        latestVersionNo: true,
        isReusable: true,
        createdAt: true,
        updatedAt: true,
        mediaUrl: true,
        mediaType: true,
        mediaKey: true,
        mediaSizeBytes: true,
        creator: {
          select: { id: true, fullName: true, email: true },
        },
        course: { select: { id: true, code: true, name: true } },
        topicLinks: {
          select: {
            topic: {
              select: { id: true, code: true, name: true },
            },
          },
          take: 1,
        },
      },
    });

    if (!question) {
      throw new NotFoundException('Không tìm thấy câu hỏi');
    }

    this.assertCanAccessQuestion(question, user);

    return {
      ...question,
      topic: question.topicLinks?.[0]?.topic || null,
    } as any;
  }

  async updateQuestion(id: string, dto: UpdateQuestionCrudDto, user: AuthUser) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        content: true,
        options: true,
        correctAnswer: true,
        explanation: true,
        difficulty: true,
        points: true,
        defaultPoints: true,
        courseId: true,
        creatorId: true,
        status: true,
        latestVersionNo: true,
        isReusable: true,
        createdAt: true,
        updatedAt: true,
        mediaKey: true,
        mediaSizeBytes: true,
      },
    });

    if (!question) {
      throw new NotFoundException('Không tìm thấy câu hỏi');
    }

    this.assertCanAccessQuestion(question, user);

    const questionData = dto;
    const requestedCourseId = String(questionData.courseId || '').trim();
    const effectiveCourseId = requestedCourseId || question.courseId || '';

    if (!effectiveCourseId) {
      throw new BadRequestException('Cần chọn khóa học để cập nhật câu hỏi');
    }

    if (requestedCourseId) {
      await this.assertCourseAccessible(requestedCourseId, user);
    }

    const topicId = String(questionData.topicId || '').trim();
    if (!topicId) {
      throw new BadRequestException('Cần chọn chủ đề để cập nhật câu hỏi');
    }

    await this.assertTopicBelongsToCourse(topicId, effectiveCourseId);

    // Validate content lengths (only when provided in the update)
    if (dto.content !== undefined) assertQuestionContentLength(dto.content);
    if (dto.options !== undefined) assertOptionsLength(dto.options);
    if (dto.explanation !== undefined) assertExplanationLength(dto.explanation);

    // Validate line content for find_error / ordering when options are provided
    const effectiveType = dto.type ?? question.type;
    if (dto.options !== undefined && (effectiveType === 'FIND_ERROR' || effectiveType === 'ORDERING')) {
      assertLineContent(dto.options);
    }

    // Attachment replaced or removed: release the old R2 object and reclaim
    // its bytes from the storage-usage counter before writing the new value.
    if (dto.mediaKey !== undefined && dto.mediaKey !== question.mediaKey) {
      await this.mediaService.releaseObject(question.mediaKey, question.mediaSizeBytes);
    }

    const updated = await this.prisma.question.update({
      where: { id },
      data: {
        type: questionData.type,
        content: questionData.content,
        options: questionData.options,
        correctAnswer: questionData.correctAnswer,
        explanation: questionData.explanation,
        difficulty: questionData.difficulty,
        points: questionData.points,
        defaultPoints: questionData.defaultPoints ?? question.defaultPoints ?? 1,
        course: effectiveCourseId
          ? { connect: { id: effectiveCourseId } }
          : undefined,
        mediaUrl: questionData.mediaUrl,
        mediaType: questionData.mediaType,
        mediaKey: questionData.mediaKey,
        mediaSizeBytes: questionData.mediaSizeBytes,
      },
    });

    await this.syncSingleQuestionTopic(id, topicId);

    return updated;
  }

  private mapAiImprovementStatus(record: any, currentQuestion?: { updatedAt?: Date | null }) {
    const payload = this.parseJson(record?.prompt, {})?.payload || {};
    const sourceUpdatedAt = payload.sourceUpdatedAt ? new Date(payload.sourceUpdatedAt) : null;
    if (
      record?.reviewStatus === 'PENDING'
      && record?.status === 'SUCCEEDED'
      && sourceUpdatedAt
      && currentQuestion?.updatedAt
      && new Date(currentQuestion.updatedAt).getTime() > sourceUpdatedAt.getTime() + 1000
    ) {
      return 'EXPIRED';
    }
    if (record?.reviewStatus === 'APPROVED') return 'APPROVED';
    if (record?.reviewStatus === 'REJECTED') return 'REJECTED';
    if (record?.status === 'QUEUED') return 'QUEUED';
    if (record?.status === 'RUNNING') return 'GENERATING';
    if (record?.status === 'FAILED') return 'FAILED';
    if (record?.status === 'SUCCEEDED') return 'READY_FOR_REVIEW';
    return 'IDLE';
  }

  private normalizeAiImprovementRecord(record: any, currentQuestion?: { updatedAt?: Date | null }) {
    if (!record) return null;
    const prompt = this.parseJson(record.prompt, {});
    const output = this.parseJson(record.output, {});
    return {
      id: record.id,
      jobId: record.id,
      status: this.mapAiImprovementStatus(record, currentQuestion),
      rawStatus: record.status,
      reviewStatus: record.reviewStatus,
      createdAt: record.createdAt,
      completedAt: record.completedAt,
      reviewedAt: record.reviewedAt,
      reviewedBy: record.reviewedBy,
      reviewNotes: record.reviewNotes,
      errorMessage: record.errorMessage,
      sourceUpdatedAt: prompt?.payload?.sourceUpdatedAt || null,
      originalSnapshot: prompt?.payload?.original || null,
      proposal: output?.draft || output?.suggestion || null,
      diagnosis: output?.diagnosis || null,
      changes: output?.changes || [],
      confidence: output?.confidence ?? null,
      warnings: output?.warnings || [],
      finalApproved: output?.finalApproved || null,
    };
  }

  private validateAiImprovementFinal(final: Record<string, any>, fallbackQuestion: any) {
    const content = this.removeAiEditorialSuffix(String(final?.content || '').trim());
    if (!content) {
      throw new BadRequestException('Cần có nội dung câu hỏi đã cải thiện');
    }
    const difficulty = Math.max(1, Math.min(10, Math.round(Number(final?.difficulty || fallbackQuestion.difficulty || 1))));
    return {
      type: this.normalizeQuestionType(final?.type || fallbackQuestion.type),
      content,
      options: final?.options && typeof final.options === 'object' ? final.options : (fallbackQuestion.options || {}),
      correctAnswer: final?.correctAnswer && typeof final.correctAnswer === 'object' ? final.correctAnswer : (fallbackQuestion.correctAnswer || {}),
      explanation: String(final?.explanation ?? fallbackQuestion.explanation ?? ''),
      difficulty,
    };
  }

  /** AI editorial notes belong in the review record, never in the student-facing stem. */
  private removeAiEditorialSuffix(content: string): string {
    return content
      .replace(/\s*\(\s*đã\s+hiệu\s+chỉnh\s+để\s+làm\s+rõ\s+yêu\s+cầu\s*\)\s*/giu, ' ')
      .replace(/\s*\(\s*revised\s+to\s+clarify(?:\s+the)?\s+requirements?\s*\)\s*/giu, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private async findActiveAiImprovement(questionId: string, examId: string) {
    const rows = await this.prisma.aIGenerationRecord.findMany({
      where: {
        examId,
        section: 'QUALITY_REVIEW',
        status: { in: ['QUEUED', 'RUNNING', 'SUCCEEDED'] },
        reviewStatus: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.find((record: any) => this.parseJson(record.prompt, {})?.payload?.task === 'question-improvement'
      && this.parseJson(record.prompt, {})?.payload?.questionId === questionId) || null;
  }

  async createQuestionAiImprovement(dto: CreateQuestionAiImprovementDto, user: AuthUser) {
    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
      include: {
        course: { select: { id: true, code: true, name: true } },
        topicLinks: { include: { topic: true } },
        versions: { orderBy: { versionNo: 'desc' }, take: 1 },
      },
    });
    if (!question) throw new NotFoundException('Không tìm thấy câu hỏi');
    this.assertCanAccessQuestion(question, user);

    const examQuestion = await this.prisma.examQuestion.findFirst({
      where: { examId: dto.examId, questionId: dto.questionId },
      select: { id: true, examId: true, questionId: true, questionVersionId: true, orderIndex: true, points: true, assignedScore: true },
    });
    if (!examQuestion) throw new NotFoundException('Câu hỏi này không thuộc bài thi');

    const latestVersion = question.versions?.[0] || null;
    // MySQL's GET_LOCK() rejects any name over 64 chars — two raw UUIDs plus
    // the prefix runs to ~97, which always failed (error 4163) and surfaced
    // to the lecturer as a 500. Hash the identifying pair down to a fixed,
    // safely-short name instead; collisions are irrelevant here since the
    // lock only needs to serialize concurrent requests for the same
    // exam+question, not be reversible.
    const lockName = `qai:${createHash('md5').update(`${dto.examId}:${dto.questionId}`).digest('hex')}`;
    const lockRows = await this.prisma.$queryRawUnsafe(`SELECT GET_LOCK(?, 5) AS locked`, lockName) as Array<{ locked: number }>;
    if (!lockRows?.[0]?.locked) {
      throw new ConflictException('Đang có yêu cầu cải thiện bằng AI khác được tạo cho câu hỏi này');
    }

    try {
      const active = await this.findActiveAiImprovement(dto.questionId, dto.examId);
      if (active) {
        return this.normalizeAiImprovementRecord(active, question);
      }

      const qualitySignals = await this.prisma.examQualityReviewItem.findMany({
        where: { questionId: dto.questionId, job: { examId: dto.examId } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      const original = {
        questionId: question.id,
        questionVersionId: latestVersion?.id || examQuestion.questionVersionId || null,
        versionNo: latestVersion?.versionNo || question.latestVersionNo || null,
        type: question.type,
        content: question.content,
        options: question.options || {},
        correctAnswer: question.correctAnswer || {},
        explanation: question.explanation || '',
        difficulty: question.difficulty || 1,
        points: question.points || 1,
        topics: question.topicLinks.map((link: any) => link.topic?.name).filter(Boolean),
      };
      const targetQuestionType = dto.targetQuestionType
        ? this.normalizeQuestionType(dto.targetQuestionType)
        : question.type;

      const record = await this.aiJobsService.createJob({
        task: 'question-improvement',
        examId: dto.examId,
        questionVersionId: latestVersion?.id || examQuestion.questionVersionId || null,
        section: AISection.QUALITY_REVIEW,
        payload: {
          task: 'question-improvement',
          questionId: dto.questionId,
          examId: dto.examId,
          examQuestionId: dto.examQuestionId || examQuestion.id,
          qualityReviewId: dto.qualityReviewId || null,
          sourceUpdatedAt: question.updatedAt.toISOString(),
          original,
          analytics: dto.analytics || {},
          instruction: String(dto.instruction || '').trim(),
          targetQuestionType,
          qualitySignals: qualitySignals.map((item) => ({
            id: item.id,
            severity: item.severity,
            reasonSummary: item.reasonSummary,
            recommendation: item.recommendation,
            statsSnapshot: item.statsSnapshot,
          })),
          language: 'vi',
          context: {
            courseId: question.courseId,
            courseCode: question.course?.code,
            courseName: question.course?.name,
            questionId: question.id,
            questionVersionId: latestVersion?.id || examQuestion.questionVersionId || null,
            questionType: question.type,
            targetQuestionType,
            examId: dto.examId,
          },
        },
        requestedBy: user.id,
      });

      return this.normalizeAiImprovementRecord(record, question);
    } finally {
      await this.prisma.$queryRawUnsafe(`SELECT RELEASE_LOCK(?) AS released`, lockName).catch(() => null);
    }
  }

  async getQuestionAiImprovement(id: string, user: AuthUser) {
    const record = await this.prisma.aIGenerationRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Không tìm thấy đề xuất cải thiện AI');
    const payload = this.parseJson(record.prompt, {})?.payload || {};
    const question = await this.prisma.question.findUnique({
      where: { id: payload.questionId },
      select: { id: true, creatorId: true, courseId: true, updatedAt: true },
    });
    if (question) this.assertCanAccessQuestion(question, user);
    return this.normalizeAiImprovementRecord(record, question || undefined);
  }

  async updateQuestionAiImprovementDraft(id: string, dto: UpdateQuestionAiImprovementDraftDto, user: AuthUser) {
    const current = await this.getQuestionAiImprovement(id, user);
    if (!current) throw new NotFoundException('Không tìm thấy đề xuất cải thiện AI');
    if (!['READY_FOR_REVIEW', 'EXPIRED'].includes(current.status)) {
      throw new BadRequestException('Chỉ có thể sửa đề xuất AI đang ở trạng thái sẵn sàng xem xét');
    }
    const record = await this.prisma.aIGenerationRecord.findUnique({ where: { id } });
    const output = this.parseJson(record?.output, {});
    const updated = await this.prisma.aIGenerationRecord.update({
      where: { id },
      data: {
        output: {
          ...output,
          draft: dto.draft,
          lecturerEditedDraft: dto.draft,
        },
      },
    });
    return this.normalizeAiImprovementRecord(updated);
  }

  async approveQuestionAiImprovement(id: string, dto: ApproveQuestionAiImprovementDto, user: AuthUser) {
    const record = await this.prisma.aIGenerationRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Không tìm thấy đề xuất cải thiện AI');
    const prompt = this.parseJson(record.prompt, {});
    const payload = prompt?.payload || {};
    const questionId = payload.questionId;
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { topicLinks: { include: { topic: true } } },
    });
    if (!question) throw new NotFoundException('Không tìm thấy câu hỏi');
    this.assertCanAccessQuestion(question, user);

    if (record.status !== 'SUCCEEDED' || record.reviewStatus !== 'PENDING') {
      throw new BadRequestException('Chỉ có thể duyệt đề xuất đang chờ và sẵn sàng xem xét');
    }

    const sourceUpdatedAt = payload.sourceUpdatedAt ? new Date(payload.sourceUpdatedAt) : null;
    if (sourceUpdatedAt && question.updatedAt.getTime() > sourceUpdatedAt.getTime() + 1000) {
      throw new ConflictException('Câu hỏi đã được sửa sau khi đề xuất AI được tạo. Vui lòng so sánh lại hoặc tạo đề xuất mới.');
    }

    const finalData = this.validateAiImprovementFinal(dto.final, question);
    const nextVersionRows = await this.prisma.$queryRawUnsafe(
      `SELECT COALESCE(MAX(versionNo), 0) + 1 AS nextVersionNo FROM question_versions WHERE questionId = ?`,
      question.id,
    ) as Array<{ nextVersionNo: number }>;
    const versionNo = Number(nextVersionRows?.[0]?.nextVersionNo || 1);
    const output = this.parseJson(record.output, {});

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedQuestion = await tx.question.update({
        where: { id: question.id },
        data: {
          type: finalData.type,
          content: finalData.content,
          options: finalData.options,
          correctAnswer: finalData.correctAnswer,
          explanation: finalData.explanation,
          difficulty: finalData.difficulty,
          latestVersionNo: versionNo,
        },
      });

      const version = await tx.questionVersion.create({
        data: {
          questionId: question.id,
          versionNo,
          stem: finalData.content,
          payload: finalData.options,
          answerKey: finalData.correctAnswer,
          explanation: finalData.explanation,
          difficulty: finalData.difficulty,
          points: question.points,
          metadata: {
            source: 'AI_ASSISTED_IMPROVEMENT',
            questionType: finalData.type,
            aiImprovementId: id,
            originalSnapshot: payload.original || null,
            aiProposal: output?.suggestion || null,
            lecturerEditedProposal: output?.lecturerEditedDraft || output?.draft || null,
          },
          aiGenerated: true,
          createdBy: user.id,
        },
      });

      const updatedRecord = await tx.aIGenerationRecord.update({
        where: { id },
        data: {
          reviewStatus: 'APPROVED',
          reviewedBy: user.id,
          reviewedAt: new Date(),
          output: {
            ...output,
            finalApproved: finalData,
            approvedQuestionVersionId: version.id,
          },
        },
      });

      await tx.examQualityReviewItem.updateMany({
        where: { questionId: question.id, job: { examId: payload.examId } },
        data: {
          reviewStatus: 'APPROVED',
          reviewedBy: user.id,
          reviewedAt: new Date(),
          reviewNotes: 'Đã xử lý bằng đề xuất cải thiện câu hỏi từ AI',
        },
      });

      return { updatedQuestion, version, updatedRecord };
    });

    return {
      ...this.normalizeAiImprovementRecord(result.updatedRecord, result.updatedQuestion),
      questionVersionId: result.version.id,
    };
  }

  async rejectQuestionAiImprovement(id: string, dto: RejectQuestionAiImprovementDto, user: AuthUser) {
    const current = await this.getQuestionAiImprovement(id, user);
    if (!current) throw new NotFoundException('Không tìm thấy đề xuất cải thiện AI');
    if (!['READY_FOR_REVIEW', 'EXPIRED', 'FAILED'].includes(current.status)) {
      throw new BadRequestException('Chỉ có thể từ chối đề xuất đã hoàn tất hoặc thất bại');
    }
    const updated = await this.prisma.aIGenerationRecord.update({
      where: { id },
      data: {
        reviewStatus: 'REJECTED',
        reviewedBy: user.id,
        reviewedAt: new Date(),
        reviewNotes: dto.reason || null,
      },
    });
    return this.normalizeAiImprovementRecord(updated);
  }

  async deleteQuestion(id: string, user: AuthUser) {
    const question = await this.prisma.question.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        content: true,
        options: true,
        correctAnswer: true,
        explanation: true,
        difficulty: true,
        points: true,
        defaultPoints: true,
        courseId: true,
        creatorId: true,
        status: true,
        latestVersionNo: true,
        isReusable: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!question) {
      throw new NotFoundException('Không tìm thấy câu hỏi');
    }

    this.assertCanAccessQuestion(question, user);
    await this.prisma.question.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
    return { message: 'Đã xóa câu hỏi thành công' };
  }

  async getQuestionStats(user: AuthUser) {
    const where = user.role === 'LECTURER' ? { creatorId: user.id } : {};

    const [total, byType, byDifficulty] = await Promise.all([
      this.prisma.question.count({ where }),
      this.prisma.question.groupBy({
        by: ['type'],
        where,
        _count: true,
      }),
      this.prisma.question.groupBy({
        by: ['difficulty'],
        where,
        _count: true,
      }),
    ]);

    return {
      total,
      byType: byType.map((item) => ({
        type: item.type,
        count: item._count,
      })),
      byDifficulty: byDifficulty.map((item) => ({
        difficulty: item.difficulty,
        count: item._count,
      })),
    };
  }

  private async assertV2Ready() {
    const required = ['question_drafts', 'ai_generation_records', 'question_versions'];
    for (const t of required) {
      if (!(await this.hasTable(t))) {
        throw new BadRequestException(
          `Question V2 table '${t}' is missing. Apply phase-01 expand schema migration before using this endpoint.`,
        );
      }
    }
  }

  private nextStep(step: QuestionDraftStepKey): QuestionDraftStepKey {
    if (step === QuestionDraftStepKey.INTENT) return QuestionDraftStepKey.CONTENT;
    if (step === QuestionDraftStepKey.CONTENT) return QuestionDraftStepKey.ANSWERS;
    if (step === QuestionDraftStepKey.ANSWERS) return QuestionDraftStepKey.CLASSIFICATION;
    return QuestionDraftStepKey.REVIEW;
  }

  private computeCompletion(state: any) {
    const intent = !!state?.intent?.questionType;
    const content = !!String(state?.content?.content || state?.content?.stem || '').trim();

    const questionType = this.normalizeQuestionType(state?.intent?.questionType || state?.content?.type);
    const options = state?.answers?.options || {};
    const answer = state?.answers?.correctAnswer;

    const optionValues = Array.isArray(options)
      ? options
      : Object.values(options || {});

    const hasEnoughOptions = optionValues.filter((x: any) => String(x || '').trim()).length >= 2;
    const hasAnswer = !!(answer && (Array.isArray(answer) ? answer.length : Object.keys(answer || {}).length));

    const answers =
      questionType === 'ESSAY' || questionType === 'SHORT_ANSWER'
        ? !!String(state?.answers?.explanation || '').trim()
        : hasEnoughOptions && hasAnswer;

    const classification = !!(
      state?.classification?.difficulty ||
      state?.classification?.topic ||
      state?.classification?.learningObjective ||
      (Array.isArray(state?.classification?.courseScopeIds) && state.classification.courseScopeIds.length > 0)
    );

    return {
      intent,
      content,
      answers,
      classification,
      review: intent && content && answers,
    };
  }

  private async fetchDraftOrThrow(draftId: string, user: AuthUser): Promise<DraftRow> {
    const rows = await this.prisma.$queryRawUnsafe(
      `SELECT id, questionId, creatorId, mode, currentStep, autosaveVersion, state, validation, createdAt, updatedAt FROM question_drafts WHERE id = ? LIMIT 1`,
      draftId,
    ) as DraftRow[];

    if (rows.length === 0) {
      throw new NotFoundException('Không tìm thấy bản nháp câu hỏi');
    }

    const draft = rows[0];
    if (user.role === 'LECTURER' && draft.creatorId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền truy cập bản nháp này');
    }

    draft.state = this.parseJson(draft.state, {});
    draft.validation = this.parseJson(draft.validation, null);
    return draft;
  }

  async createDraft(dto: CreateQuestionDraftDto, user: AuthUser) {
    await this.assertV2Ready();

    const draftId = randomUUID();
    const state: Record<string, any> = {
      intent: {
        questionType: this.normalizeQuestionType(dto.questionType),
        mode: dto.mode,
      },
      content: {},
      answers: {},
      classification: dto.initialContext || {},
    };

    let linkedQuestionId: string | null = null;

    if (dto.sourceQuestionId) {
      const source = await this.prisma.question.findUnique({
        where: { id: dto.sourceQuestionId },
        select: {
          id: true,
          type: true,
          content: true,
          options: true,
          correctAnswer: true,
          explanation: true,
          difficulty: true,
          points: true,
          defaultPoints: true,
          courseId: true,
          creatorId: true,
          status: true,
          latestVersionNo: true,
          isReusable: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!source) {
        throw new NotFoundException('Không tìm thấy câu hỏi nguồn');
      }
      if (user.role === 'LECTURER' && source.creatorId !== user.id) {
        throw new ForbiddenException('Bạn không có quyền sao chép câu hỏi này');
      }

      linkedQuestionId = source.id;
      state.intent.questionType = this.normalizeQuestionType(source.type);
      state.content = {
        content: source.content,
      };
      state.answers = {
        options: this.parseJson(source.options, source.options || {}),
        correctAnswer: this.parseJson(source.correctAnswer, source.correctAnswer || {}),
        explanation: source.explanation || '',
      };
      state.classification = {
        ...(state.classification || {}),
        difficulty: source.difficulty,
        points: source.points,
        courseScopeIds: source.courseId ? [source.courseId] : [],
      };
    }

    await this.prisma.$executeRawUnsafe(
      `
      INSERT INTO question_drafts (id, questionId, creatorId, mode, currentStep, autosaveVersion, state, validation, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, 'INTENT', 1, ?, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
      `,
      draftId,
      linkedQuestionId,
      user.id,
      dto.mode,
      JSON.stringify(state),
    );

    return {
      draftId,
      questionId: linkedQuestionId,
      currentStep: QuestionDraftStepKey.INTENT,
      autosaveVersion: 1,
      state,
    };
  }

  async saveStep(draftId: string, stepKey: QuestionDraftStepKey, dto: SaveDraftStepDto, user: AuthUser) {
    await this.assertV2Ready();
    const draft = await this.fetchDraftOrThrow(draftId, user);

    if (draft.autosaveVersion !== dto.autosaveVersion) {
      throw new ConflictException('Bản nháp đã có thay đổi mới hơn. Vui lòng tải lại và thử lại.');
    }

    const nextState = {
      ...(draft.state || {}),
      [stepKey]: dto.data,
    };

    const completion = this.computeCompletion(nextState);
    const nextVersion = draft.autosaveVersion + 1;
    const nextStep = this.nextStep(stepKey);

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE question_drafts
      SET state = ?, autosaveVersion = ?, currentStep = ?, updatedAt = UTC_TIMESTAMP(3)
      WHERE id = ?
      `,
      JSON.stringify(nextState),
      nextVersion,
      nextStep.toUpperCase(),
      draftId,
    );

    return {
      draftId,
      autosaveVersion: nextVersion,
      completion,
      currentStep: nextStep,
      state: nextState,
    };
  }

  private buildAIPrompt(section: AISection, state: any, instruction?: string) {
    const questionType = this.normalizeQuestionType(state?.intent?.questionType || state?.content?.type);
    const content = String(state?.content?.content || state?.content?.stem || '').trim();

    const head = [
      `Question type: ${questionType}`,
      content ? `Current stem: ${content}` : 'Current stem: not provided',
      instruction ? `Additional instruction: ${instruction}` : '',
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

  async aiGenerateSection(draftId: string, dto: AIGenerateSectionDto, user: AuthUser) {
    await this.assertV2Ready();
    const draft = await this.fetchDraftOrThrow(draftId, user);
    const record = await this.aiJobsService.createJob({
      task: 'draft-section',
      draftId,
      questionVersionId: null,
      section: dto.section,
      payload: {
        section: dto.section,
        instruction: dto.instruction || '',
        constraints: dto.constraints || {},
        draftState: draft.state,
        questionId: draft.questionId,
      },
      requestedBy: user.id,
    });

    return {
      jobId: record.id,
      status: record.status,
    };
  }

  async applyAICandidate(draftId: string, dto: ApplyAICandidateDto, user: AuthUser) {
    await this.assertV2Ready();
    const draft = await this.fetchDraftOrThrow(draftId, user);

    const rows = await this.prisma.$queryRawUnsafe(
      `SELECT id, draftId, section, status, output FROM ai_generation_records WHERE id = ? LIMIT 1`,
      dto.jobId,
    ) as Array<{ id: string; draftId: string | null; section: string; status: string; output: any }>;

    if (rows.length === 0) throw new NotFoundException('Không tìm thấy tác vụ tạo bằng AI');
    const job = rows[0];
    if (job.draftId !== draftId) {
      throw new BadRequestException('Tác vụ AI này không thuộc bản nháp này');
    }
    if (job.status !== 'SUCCEEDED') {
      throw new BadRequestException(`Tác vụ AI chưa sẵn sàng (trạng thái=${job.status})`);
    }

    const output = this.parseJson(job.output, {});
    const candidates = Array.isArray(output?.candidates) ? output.candidates : [];
    const candidate = candidates.find((c: any) => c?.id === dto.candidateId);
    if (!candidate) {
      throw new NotFoundException('Không tìm thấy phương án do AI đề xuất');
    }

    const nextState = { ...(draft.state || {}) };

    if (dto.section === AISection.CONTENT) {
      nextState.content = {
        ...(nextState.content || {}),
        content: candidate.content || nextState.content?.content || '',
      };
    } else if (dto.section === AISection.ANSWERS) {
      nextState.answers = {
        ...(nextState.answers || {}),
        options: candidate.options || nextState.answers?.options || {},
        correctAnswer: candidate.correctAnswer || nextState.answers?.correctAnswer || {},
      };
    } else if (dto.section === AISection.EXPLANATION) {
      nextState.answers = {
        ...(nextState.answers || {}),
        explanation: candidate.explanation || nextState.answers?.explanation || '',
      };
    } else {
      nextState.classification = {
        ...(nextState.classification || {}),
        topic: candidate.topic || nextState.classification?.topic || '',
        learningObjective: candidate.learningObjective || nextState.classification?.learningObjective || '',
        difficulty: typeof candidate.difficulty !== 'undefined'
          ? candidate.difficulty
          : nextState.classification?.difficulty,
      };
    }

    const nextVersion = draft.autosaveVersion + 1;
    await this.prisma.$executeRawUnsafe(
      `UPDATE question_drafts SET state = ?, autosaveVersion = ?, updatedAt = UTC_TIMESTAMP(3) WHERE id = ?`,
      JSON.stringify(nextState),
      nextVersion,
      draftId,
    );

    return {
      draftId,
      autosaveVersion: nextVersion,
      state: nextState,
    };
  }

  async validateDraft(draftId: string, dto: ValidateQuestionDraftDto, user: AuthUser) {
    await this.assertV2Ready();
    const draft = await this.fetchDraftOrThrow(draftId, user);
    const state = draft.state || {};

    const level = dto.level || DraftValidationLevel.SOFT;
    const errors: Array<{ code: string; path: string; message: string }> = [];
    const warnings: Array<{ code: string; path: string; message: string }> = [];

    const type = this.normalizeQuestionType(state?.intent?.questionType || state?.content?.type);
    const stem = String(state?.content?.content || state?.content?.stem || '').trim();

    if (!stem) {
      errors.push({ code: 'MISSING_STEM', path: 'content.content', message: 'Cần nhập nội dung câu hỏi' });
    } else if (stem.length < 12) {
      warnings.push({ code: 'SHORT_STEM', path: 'content.content', message: 'Nội dung câu hỏi khá ngắn' });
    }

    const options = state?.answers?.options || {};
    const correctAnswer = state?.answers?.correctAnswer || {};

    if (['MULTIPLE_CHOICE', 'MULTI_SELECT', 'TRUE_FALSE', 'FIND_ERROR'].includes(type)) {
      const optionList = Array.isArray(options) ? options : Object.values(options || {});
      const filled = optionList.filter((x: any) => String(x || '').trim());
      if (filled.length < 2) {
        errors.push({ code: 'INSUFFICIENT_OPTIONS', path: 'answers.options', message: 'Cần ít nhất 2 phương án trả lời' });
      }

      // FIND_ERROR: each line must be unique
      if (type === 'FIND_ERROR') {
        const trimmedLines = filled.map((x: any) => String(x || '').trim());
        const seen = new Set<string>();
        for (const line of trimmedLines) {
          if (seen.has(line)) {
            errors.push({ code: 'DUPLICATE_FIND_ERROR_LINE', path: 'answers.options', message: 'Các dòng trong câu hỏi tìm lỗi sai không được trùng lặp. Hãy tạo lại bằng AI hoặc sửa thủ công.' });
            break;
          }
          seen.add(line);
        }
      }

      const answerSize = Array.isArray(correctAnswer)
        ? correctAnswer.length
        : Object.keys(correctAnswer || {}).length;
      if (answerSize === 0) {
        errors.push({ code: 'MISSING_CORRECT_ANSWER', path: 'answers.correctAnswer', message: 'Cần chọn đáp án đúng' });
      }
    }

    const explanation = String(state?.answers?.explanation || '').trim();
    if (!explanation) {
      warnings.push({ code: 'MISSING_EXPLANATION', path: 'answers.explanation', message: 'Nên bổ sung phần giải thích' });
    }

    // Tags are no longer required or stored; skip tag validation

    const qualityScore = Math.max(0, 100 - errors.length * 18 - warnings.length * 6);
    const valid = errors.length === 0;

    const validationResult = {
      valid,
      level,
      errors,
      warnings,
      qualityScore,
      validatedAt: new Date().toISOString(),
    };

    await this.prisma.$executeRawUnsafe(
      `UPDATE question_drafts SET validation = ?, updatedAt = UTC_TIMESTAMP(3) WHERE id = ?`,
      JSON.stringify(validationResult),
      draftId,
    );

    return validationResult;
  }

  private normalizeDifficultyRaw(input: any): number {
    const n = Number(input);
    if (Number.isNaN(n)) return 5;
    if (n <= 1) return Math.max(1, Math.min(10, Math.round(n * 10)));
    return Math.max(1, Math.min(10, Math.round(n)));
  }

  private extractBlankAnswers(content: string): { answers: string[] } {
    const regex = /\[\[([^\]]+)\]\]/g;
    const answers: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      answers.push(match[1].trim());
    }
    return { answers };
  }

  async getQuestionHistory(params: { courseId?: string }, user: AuthUser) {
    const courseId = String(params.courseId || '').trim();
    const where: any = {};

    if (courseId) {
      where.courseId = courseId;
    }

    if (user.role === 'LECTURER') {
      where.OR = [
        { creatorId: user.id },
        { course: { lecturerId: user.id } },
      ];
    }

    const questions = await this.prisma.question.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        type: true,
        content: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        course: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        versions: {
          orderBy: { versionNo: 'asc' },
          select: {
            id: true,
            versionNo: true,
            stem: true,
            metadata: true,
            aiGenerated: true,
            createdAt: true,
            statistics: {
              select: {
                totalAttempts: true,
                correctAttempts: true,
                incorrectAttempts: true,
                skippedAttempts: true,
                pValue: true,
                difficultyIndex: true,
                discriminationIndex: true,
                lastRecomputedAt: true,
              },
            },
          },
        },
      },
    });

    const versionIds = questions.flatMap((question) => question.versions.map((version) => version.id));
    // Keep version-level and exam-usage-level analytics separate. A question
    // version is an immutable content revision; an exam is a cohort/context in
    // which that revision was used. Joining them as one time series makes a
    // cohort change look like a content revision.
    const usageRows = versionIds.length
      ? await this.prisma.$queryRawUnsafe(
          `
          SELECT
            sa.questionVersionId,
            es.examId,
            e.title AS examTitle,
            e.startTime AS examStartTime,
            e.createdAt AS examCreatedAt,
            COUNT(sa.id) AS attempts,
            COUNT(DISTINCT es.studentId) AS students,
            SUM(CASE WHEN sa.isCorrect = 1 THEN 1 ELSE 0 END) AS correctAttempts,
            SUM(CASE WHEN sa.isCorrect = 0 THEN 1 ELSE 0 END) AS incorrectAttempts,
            SUM(CASE WHEN sa.isCorrect IS NULL THEN 1 ELSE 0 END) AS skippedAttempts
          FROM submission_answers sa
          INNER JOIN exam_submissions es
            ON es.id = sa.submissionId AND es.status IN ('SUBMITTED', 'GRADED', 'FLAGGED', 'FINALIZED')
          INNER JOIN exams e ON e.id = es.examId
          WHERE sa.questionVersionId IN (${versionIds.map(() => '?').join(',')})
          GROUP BY sa.questionVersionId, es.examId, e.title, e.startTime, e.createdAt
          ORDER BY COALESCE(e.startTime, e.createdAt) ASC, e.title ASC
          `,
          ...versionIds,
        ) as Array<{
          questionVersionId: string;
          examId: string;
          examTitle: string;
          examStartTime: Date | null;
          examCreatedAt: Date;
          attempts: bigint | number;
          students: bigint | number;
          correctAttempts: bigint | number;
          incorrectAttempts: bigint | number;
          skippedAttempts: bigint | number;
        }>
      : [];

    const usageByVersion = new Map<string, typeof usageRows>();
    for (const row of usageRows) {
      const list = usageByVersion.get(row.questionVersionId) || [];
      list.push(row);
      usageByVersion.set(row.questionVersionId, list);
    }

    const toNumber = (value: any, fallback = 0) => {
      if (value === null || typeof value === 'undefined') return fallback;
      if (typeof value?.toNumber === 'function') return value.toNumber();
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };

    const rows = questions.map((question) => {
      const toMetric = (input: {
        versionId: string;
        versionNo: number;
        attempts: number;
        correctAttempts: number;
        incorrectAttempts: number;
        skippedAttempts: number;
        usageCount: number;
        examId?: string | null;
        exam?: string | null;
        date?: Date | string | null;
        students?: number | null;
      }) => {
        const correctRate = input.attempts > 0 ? input.correctAttempts / input.attempts : null;
        const discrimination = input.attempts > 0
          ? Math.max(-1, Math.min(1, (input.correctAttempts - input.incorrectAttempts) / input.attempts))
          : null;
        return {
          ...input,
          examId: input.examId || null,
          exam: input.exam || `Phiên bản ${input.versionNo}`,
          date: new Date(input.date || 0).toISOString().slice(0, 10),
          students: input.students ?? null,
          correctRate,
          // In ExamTrust, p is the proportion correct: higher means easier.
          difficulty: correctRate,
          discrimination,
          reliability: input.attempts >= 10 && discrimination !== null
            ? Math.max(0, Math.min(1, 1 - Math.abs(discrimination - 0.45)))
            : null,
        };
      };

      const versionMetrics = question.versions.map((version) => {
        const stats = version.statistics;
        const usages = usageByVersion.get(version.id) || [];
        const aggregate = usages.reduce(
          (sum, usage) => ({
            attempts: sum.attempts + toNumber(usage.attempts),
            correctAttempts: sum.correctAttempts + toNumber(usage.correctAttempts),
            incorrectAttempts: sum.incorrectAttempts + toNumber(usage.incorrectAttempts),
            skippedAttempts: sum.skippedAttempts + toNumber(usage.skippedAttempts),
          }),
          { attempts: 0, correctAttempts: 0, incorrectAttempts: 0, skippedAttempts: 0 },
        );
        // Old submissions can predate questionVersionId on SubmissionAnswer.
        // Retain their existing version statistic as a compatible fallback,
        // but never attach it to a particular exam/cohort.
        const fallbackAttempts = Number(stats?.totalAttempts || 0);
        const source = aggregate.attempts > 0
          ? aggregate
          : {
              attempts: fallbackAttempts,
              correctAttempts: Number(stats?.correctAttempts || 0),
              incorrectAttempts: Number(stats?.incorrectAttempts || 0),
              skippedAttempts: Number(stats?.skippedAttempts || 0),
            };
        return toMetric({
          versionId: version.id,
          versionNo: version.versionNo,
          ...source,
          usageCount: usages.length,
          date: version.createdAt,
        });
      });

      const examUsageMetrics = usageRows
        .filter((usage) => question.versions.some((version) => version.id === usage.questionVersionId))
        .map((usage) => {
          const version = question.versions.find((item) => item.id === usage.questionVersionId)!;
          return toMetric({
            versionId: version.id,
            versionNo: version.versionNo,
            examId: usage.examId,
            exam: usage.examTitle,
            date: usage.examStartTime || usage.examCreatedAt,
            attempts: toNumber(usage.attempts),
            students: toNumber(usage.students),
            correctAttempts: toNumber(usage.correctAttempts),
            incorrectAttempts: toNumber(usage.incorrectAttempts),
            skippedAttempts: toNumber(usage.skippedAttempts),
            usageCount: 1,
          });
        });

      const usableMetrics = versionMetrics.filter((metric) => metric.attempts > 0);
      const first = usableMetrics[0];
      const last = usableMetrics[usableMetrics.length - 1];
      const difficultyDelta = first && last && first.difficulty !== null && last.difficulty !== null
        ? last.difficulty - first.difficulty
        : 0;
      const discriminationDelta = first && last && first.discrimination !== null && last.discrimination !== null
        ? last.discrimination - first.discrimination
        : 0;

      const trend =
        usableMetrics.length < 2
          ? 'stable'
          : difficultyDelta > 0.12 || discriminationDelta < -0.12
            ? 'degrading'
            : difficultyDelta < -0.08 || discriminationDelta > 0.08
              ? 'improving'
              : 'stable';

      const recommendation =
        usableMetrics.length === 0
          ? 'Chưa có đủ dữ liệu bài nộp hoàn tất. Hãy thu thập thêm lượt làm bài trước khi đưa ra quyết định chất lượng.'
          : trend === 'degrading'
            ? 'Cần xem xét lại cách diễn đạt, các phương án nhiễu và hiệu chỉnh lại độ khó trước khi tái sử dụng câu hỏi này.'
            : null;

      return {
        id: question.id,
        content: question.versions[question.versions.length - 1]?.stem || question.content,
        course: question.course?.code || question.course?.name || 'Unscoped',
        courseId: question.course?.id || null,
        type: question.type,
        status: question.status,
        createdAt: question.createdAt,
        updatedAt: question.updatedAt,
        // `metrics` remains as a backward-compatible alias for consumers that
        // previously expected one value per question version.
        metrics: versionMetrics,
        versionMetrics,
        examUsageMetrics,
        versions: question.versions.map((version) => ({
          id: version.id,
          versionNo: version.versionNo,
          stem: version.stem,
          aiGenerated: version.aiGenerated,
          createdAt: version.createdAt,
          metadata: this.parseJson(version.metadata, {}),
        })),
        trend,
        recommendation,
      };
    });

    return {
      data: rows,
      stats: {
        totalQuestions: rows.length,
        withAttempts: rows.filter((row) => row.metrics.some((metric) => metric.attempts > 0)).length,
        degrading: rows.filter((row) => row.trend === 'degrading').length,
        aiGenerated: rows.filter((row) => row.versions.some((version) => version.aiGenerated)).length,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  async listTopics(params?: { search?: string; page?: number; limit?: number; courseId?: string }) {
    const page = Math.max(1, Number(params?.page || 1));
    const limit = Math.max(1, Math.min(100, Number(params?.limit || 20)));
    const search = String(params?.search || '').trim();
    const courseId = String(params?.courseId || '').trim();

    if (!(await this.hasTable('topics'))) {
      return {
        data: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    const where: string[] = [];
    const args: any[] = [];

    if (search) {
      where.push('(t.code LIKE ? OR t.name LIKE ?)');
      args.push(`%${search}%`, `%${search}%`);
    }

    if (courseId && (await this.hasTable('course_topics'))) {
      where.push('EXISTS (SELECT 1 FROM course_topics ct WHERE ct.topicId = t.id AND ct.courseId = ?)');
      args.push(courseId);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const countRows = await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS total FROM topics t ${whereClause}`,
      ...args,
    ) as Array<{ total: bigint | number }>;

    const rows = await this.prisma.$queryRawUnsafe(
      `
      SELECT t.id, t.code, t.name, t.createdAt
      FROM topics t
      ${whereClause}
      ORDER BY t.code ASC, t.name ASC
      LIMIT ? OFFSET ?
      `,
      ...args,
      limit,
      (page - 1) * limit,
    ) as Array<{ id: string; code: string; name: string; createdAt: Date }>;

    const total = Number(countRows?.[0]?.total || 0);
    return {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createOrGetTopic(input: { code: string; name: string; courseId?: string }, user: AuthUser) {
    const code = String(input?.code || '').trim();
    const name = String(input?.name || '').trim();
    const courseId = String(input?.courseId || '').trim();
    if (!code || !name) {
      throw new BadRequestException('Cần nhập mã và tên chủ đề');
    }

    if (!courseId) {
      throw new BadRequestException('Cần cung cấp courseId');
    }

    await this.assertCourseAccessible(courseId, user);

    if (!(await this.hasTable('topics'))) {
      throw new BadRequestException('Bảng Topics chưa khả dụng. Vui lòng áp dụng schema phase-01 trước.');
    }

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO topics (id, code, name, createdAt) VALUES (UUID(), ?, ?, UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      code,
      name,
    );

    const rows = await this.prisma.$queryRawUnsafe(
      `SELECT id, code, name, createdAt FROM topics WHERE code = ? LIMIT 1`,
      code,
    ) as Array<{ id: string; code: string; name: string; createdAt: Date }>;

    if (rows.length === 0) {
      throw new BadRequestException('Không thể tạo chủ đề');
    }

    const topic = rows[0];

    if (await this.hasTable('course_topics')) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO course_topics (courseId, topicId) VALUES (?, ?) ON DUPLICATE KEY UPDATE courseId = VALUES(courseId)`,
        courseId,
        topic.id,
      );
    }

    return topic;
  }

  async setCourseTopics(courseId: string, topicIds: string[]) {
    const normalizedCourseId = String(courseId || '').trim();
    if (!normalizedCourseId) {
      throw new BadRequestException('Cần cung cấp courseId');
    }

    const course = await this.prisma.course.findUnique({ where: { id: normalizedCourseId }, select: { id: true } });
    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    if (!(await this.hasTable('course_topics'))) {
      throw new BadRequestException('Bảng CourseTopics chưa khả dụng. Vui lòng áp dụng schema phase-01 trước.');
    }

    const cleanTopicIds = Array.from(new Set((topicIds || []).map((x) => String(x).trim()).filter(Boolean)));

    await this.prisma.$transaction(async () => {
      await this.prisma.$executeRawUnsafe(`DELETE FROM course_topics WHERE courseId = ?`, normalizedCourseId);
      for (const topicId of cleanTopicIds) {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO course_topics (courseId, topicId) VALUES (?, ?) ON DUPLICATE KEY UPDATE courseId = VALUES(courseId)`,
          normalizedCourseId,
          topicId,
        );
      }
    });

    return {
      courseId: normalizedCourseId,
      topicIds: cleanTopicIds,
      count: cleanTopicIds.length,
    };
  }

  private async fetchFilteredQuestionIds(query: ListQuestionsQueryDto, user: AuthUser, page: number, limit: number) {
    const where: string[] = [];
    const args: any[] = [];

    if (user.role === 'LECTURER') {
      where.push('q.creatorId COLLATE utf8mb4_unicode_ci = ?');
      args.push(user.id);
    }

    if (query.type) {
      where.push('q.type = ?');
      args.push(this.normalizeQuestionType(query.type));
    }

    if (query.difficulty) {
      where.push('q.difficulty = ?');
      args.push(Number(query.difficulty));
    }

    if (query.search) {
      where.push('q.content COLLATE utf8mb4_unicode_ci LIKE ?');
      args.push(`%${query.search}%`);
    }

    if (await this.hasColumn('questions', 'status')) {
      where.push('q.status = ?');
      args.push(query.status || 'PUBLISHED');
    }

    if (query.courseId) {
      if (await this.hasTable('question_course_scopes')) {
        // A question always belongs to its own home course (q.courseId) even when it
        // has no row in question_course_scopes yet — that table only adds extra courses
        // a question is shared into (e.g. via AI draft publish), it isn't the sole source
        // of truth for a question's primary course.
        where.push('(q.courseId COLLATE utf8mb4_unicode_ci = ? OR EXISTS (SELECT 1 FROM question_course_scopes qcs WHERE qcs.questionId COLLATE utf8mb4_unicode_ci = q.id COLLATE utf8mb4_unicode_ci AND qcs.courseId COLLATE utf8mb4_unicode_ci = ?))');
        args.push(query.courseId, query.courseId);
      } else {
        where.push('q.courseId COLLATE utf8mb4_unicode_ci = ?');
        args.push(query.courseId);
      }
    }

    // tagId filtering removed (tags normalized storage removed)

    if (query.topicId) {
      const topicPredicates: string[] = [];

      if (await this.hasTable('question_topics')) {
        topicPredicates.push(
          'EXISTS (SELECT 1 FROM question_topics qtp WHERE qtp.questionId COLLATE utf8mb4_unicode_ci = q.id COLLATE utf8mb4_unicode_ci AND qtp.topicId COLLATE utf8mb4_unicode_ci = ?)'
        );
        args.push(query.topicId);
      }

      if (await this.hasColumn('questions', 'topicId')) {
        topicPredicates.push('q.topicId COLLATE utf8mb4_unicode_ci = ?');
        args.push(query.topicId);
      }

      if ((await this.hasColumn('questions', 'topic')) && (await this.hasTable('topics'))) {
        topicPredicates.push(
          'EXISTS (SELECT 1 FROM topics t WHERE t.id COLLATE utf8mb4_unicode_ci = ? AND q.topic COLLATE utf8mb4_unicode_ci = t.name COLLATE utf8mb4_unicode_ci)'
        );
        args.push(query.topicId);
      }

      if (topicPredicates.length === 0) {
        throw new BadRequestException('Lọc theo chủ đề chưa khả dụng. Vui lòng áp dụng schema backfill cho chủ đề.');
      }

      where.push(`(${topicPredicates.join(' OR ')})`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const countRows = await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS total FROM questions q ${whereClause}`,
      ...args,
    ) as Array<{ total: bigint | number }>;

    const idRows = await this.prisma.$queryRawUnsafe(
      `
      SELECT q.id
      FROM questions q
      ${whereClause}
      ORDER BY q.updatedAt DESC
      LIMIT ? OFFSET ?
      `,
      ...args,
      limit,
      (page - 1) * limit,
    ) as Array<{ id: string }>;

    return {
      ids: idRows.map((r) => r.id),
      total: Number(countRows?.[0]?.total || 0),
    };
  }

  async publishDraft(draftId: string, dto: PublishQuestionDraftDto, user: AuthUser) {
    await this.assertV2Ready();
    const draft = await this.fetchDraftOrThrow(draftId, user);

    if (draft.autosaveVersion !== dto.expectedAutosaveVersion) {
      throw new ConflictException('Bản nháp đã có thay đổi mới hơn. Vui lòng tải lại và thử công bố lại.');
    }

    const validation = await this.validateDraft(
      draftId,
      { level: DraftValidationLevel.STRICT },
      user,
    );

    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Bản nháp chưa hợp lệ',
        errors: validation.errors,
      });
    }

    const state = draft.state || {};
    const type = this.normalizeQuestionType(state?.intent?.questionType || state?.content?.type);
    const content = String(state?.content?.content || state?.content?.stem || '').trim();
    const options = state?.answers?.options || {};
    const correctAnswer = type === 'FILL_IN_BLANK'
      ? this.extractBlankAnswers(content)
      : (state?.answers?.correctAnswer || {});
    const explanation = String(state?.answers?.explanation || '').trim() || null;
    const difficulty = this.normalizeDifficultyRaw(state?.classification?.difficulty);
    const defaultPoints = Number(state?.classification?.points ?? 1);
    if (!Number.isInteger(defaultPoints) || defaultPoints < 1 || defaultPoints > 5) {
      throw new BadRequestException('Hệ số điểm mặc định phải là số nguyên từ 1 đến 5');
    }
    const topicId = String(state?.classification?.topicId || state?.classification?.topic || '').trim();

    if (!topicId) {
      throw new BadRequestException('Cần chọn chủ đề trước khi công bố câu hỏi');
    }

    const courseScopeIds = Array.isArray(state?.classification?.courseScopeIds)
      ? state.classification.courseScopeIds.map((x: any) => String(x)).filter(Boolean)
      : [];

    // Single optional media attachment. `media` is `null` when the lecturer
    // has no attachment (or explicitly removed it), or an object describing
    // an already-confirmed R2 upload otherwise. See MediaModule.
    const media = state?.classification?.media || null;
    const mediaFields = {
      mediaUrl: media?.mediaUrl ?? null,
      mediaType: media?.mediaType ?? null,
      mediaKey: media?.mediaKey ?? null,
      mediaSizeBytes: media?.mediaSizeBytes ?? null,
    };

    const requestedCourseId =
      courseScopeIds.length > 0
        ? courseScopeIds[0]
        : String(state?.classification?.courseId || '').trim() || null;

    let existingCourseId: string | null = null;

    let questionId = draft.questionId;
    let resolvedCourseId = requestedCourseId;

    if (questionId) {
      const existing = await this.prisma.question.findUnique({
        where: { id: questionId },
        select: { id: true, creatorId: true, courseId: true, mediaKey: true, mediaSizeBytes: true },
      });
      if (!existing) throw new NotFoundException('Không tìm thấy câu hỏi liên kết');

      existingCourseId = existing.courseId || null;
      resolvedCourseId = requestedCourseId || existingCourseId;
      if (!resolvedCourseId) {
        throw new BadRequestException('Cần chọn khóa học trước khi công bố câu hỏi');
      }

      await this.assertTopicBelongsToCourse(topicId, resolvedCourseId);

      // Attachment replaced or removed: release the old R2 object and
      // reclaim its bytes from the storage-usage counter first.
      if (mediaFields.mediaKey !== existing.mediaKey) {
        await this.mediaService.releaseObject(existing.mediaKey, existing.mediaSizeBytes);
      }

      await this.prisma.question.update({
        where: { id: questionId },
        data: {
          type,
          content,
          options,
          correctAnswer,
          explanation,
          difficulty,
          points: defaultPoints,
          defaultPoints,
          course: (requestedCourseId || existingCourseId)
            ? { connect: { id: (requestedCourseId || existingCourseId)! } }
            : undefined,
          ...mediaFields,
        },
      });
    } else {
      if (!requestedCourseId) {
        throw new BadRequestException('Cần chọn khóa học trước khi công bố câu hỏi');
      }
      resolvedCourseId = requestedCourseId;
      await this.assertTopicBelongsToCourse(topicId, resolvedCourseId);
      const created = await this.prisma.question.create({
        data: {
          type,
          content,
          options,
          correctAnswer,
          explanation,
          difficulty,
          points: defaultPoints,
          defaultPoints,
          course: { connect: { id: requestedCourseId } },
          creator: { connect: { id: user.id } },
          ...mediaFields,
        },
        select: {
          id: true,
        },
      });
      questionId = created.id;
    }

    const persistedQuestionId = questionId as string;
    await this.syncSingleQuestionTopic(persistedQuestionId, topicId);

    const versionRows = await this.prisma.$queryRawUnsafe(
      `SELECT COALESCE(MAX(versionNo), 0) + 1 AS nextVersionNo FROM question_versions WHERE questionId = ?`,
      questionId,
    ) as Array<{ nextVersionNo: number }>;

    const versionNo = Number(versionRows?.[0]?.nextVersionNo || 1);
    const versionId = randomUUID();
    const aiRecordCount = await this.prisma.aIGenerationRecord.count({
      where: { draftId },
    });
    const isAiGeneratedVersion = draft.mode === 'AI_ASSISTED' || aiRecordCount > 0;

    await this.prisma.$executeRawUnsafe(
      `
      INSERT INTO question_versions (id, questionId, versionNo, stem, payload, answerKey, explanation, difficulty, points, metadata, aiGenerated, createdBy, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))
      `,
      versionId,
      questionId,
      versionNo,
      content,
      JSON.stringify(options || {}),
      JSON.stringify(correctAnswer || {}),
      explanation,
      difficulty,
      defaultPoints,
      JSON.stringify({
        learningObjective: state?.classification?.learningObjective || null,
        topic: state?.classification?.topic || null,
        defaultPoints,
      }),
      isAiGeneratedVersion ? 1 : 0,
      user.id,
    );

    // Tags are no longer stored in the DB; skip tag upsert and linking

    if (courseScopeIds.length > 0) {
      for (const courseId of courseScopeIds) {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO question_course_scopes (questionId, courseId) VALUES (?, ?) ON DUPLICATE KEY UPDATE questionId = VALUES(questionId)`,
          questionId,
          courseId,
        );
      }
    }

    if (await this.hasColumn('questions', 'latestVersionNo')) {
      const status = dto.publishMode === DraftPublishMode.IN_REVIEW ? 'IN_REVIEW' : 'PUBLISHED';
      const hasStatus = await this.hasColumn('questions', 'status');
      const hasReusable = await this.hasColumn('questions', 'isReusable');

      if (hasStatus && hasReusable) {
        await this.prisma.$executeRawUnsafe(
          `UPDATE questions SET latestVersionNo = ?, status = ?, isReusable = 1, updatedAt = UTC_TIMESTAMP(3) WHERE id = ?`,
          versionNo,
          status,
          questionId,
        );
      } else {
        await this.prisma.$executeRawUnsafe(
          `UPDATE questions SET latestVersionNo = ?, updatedAt = UTC_TIMESTAMP(3) WHERE id = ?`,
          versionNo,
          questionId,
        );
      }
    }

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE question_drafts
      SET questionId = ?, currentStep = 'REVIEW', autosaveVersion = autosaveVersion + 1, updatedAt = UTC_TIMESTAMP(3)
      WHERE id = ?
      `,
      questionId,
      draftId,
    );

    return {
      questionId,
      versionId,
      versionNo,
      status: dto.publishMode === DraftPublishMode.IN_REVIEW ? 'IN_REVIEW' : 'PUBLISHED',
    };
  }

  async listQuestions(query: ListQuestionsQueryDto, user: AuthUser) {
    const page = Math.max(1, Number((query as any).page || 1));
    const limit = Math.max(1, Math.min(100, Number((query as any).limit || 20)));

    const { ids: questionIds, total } = await this.fetchFilteredQuestionIds(query, user, page, limit);

    if (questionIds.length === 0) {
      return {
        data: [],
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    const items = await this.prisma.question.findMany({
      where: { id: { in: questionIds } },
      select: {
        id: true,
        type: true,
        content: true,
        options: true,
        correctAnswer: true,
        explanation: true,
        difficulty: true,
        points: true,
        courseId: true,
        creatorId: true,
        createdAt: true,
        updatedAt: true,
        mediaType: true,
        mediaUrl: true,
        course: { select: { id: true, code: true, name: true } },
        topicLinks: {
          select: { topic: { select: { id: true, code: true, name: true } } },
          take: 1,
        },
      },
    });

    const orderMap = new Map(questionIds.map((id, idx) => [id, idx]));
    items.sort((a: any, b: any) => (orderMap.get(a.id)! - orderMap.get(b.id)!));

    let latestVersionsMap = new Map<string, any>();
    if (questionIds.length > 0 && (await this.hasTable('question_versions'))) {
      const placeholders = questionIds.map(() => '?').join(',');
      const rows = await this.prisma.$queryRawUnsafe(
        `
        SELECT qv.id, qv.questionId, qv.versionNo, qv.stem, qv.explanation, qv.difficulty, qv.points, qv.metadata
        FROM question_versions qv
        INNER JOIN (
          SELECT questionId, MAX(versionNo) AS maxVersionNo
          FROM question_versions
          WHERE questionId IN (${placeholders})
          GROUP BY questionId
        ) latest ON latest.questionId = qv.questionId AND latest.maxVersionNo = qv.versionNo
        `,
        ...questionIds,
      ) as Array<any>;

      latestVersionsMap = new Map(rows.map((r) => [r.questionId, {
        id: r.id,
        versionNo: Number(r.versionNo),
        stem: r.stem,
        explanation: r.explanation,
        difficulty: r.difficulty,
        points: r.points,
        metadata: this.parseJson(r.metadata, null),
      }]));
    }

    // Tags were removed from question model; no tag joins needed

    const data = items.map((q: any) => ({
      id: q.id,
      type: q.type,
      content: q.content,
      explanation: q.explanation,
      difficulty: q.difficulty,
      points: q.points,
      course: q.course,
      courseId: q.courseId,
      creatorId: q.creatorId,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
      mediaType: q.mediaType,
      mediaUrl: q.mediaUrl,
      topic: q.topicLinks?.[0]?.topic || null,
      latestVersion: latestVersionsMap.get(q.id) || null,
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getJobStatus(jobId: string, user: AuthUser) {
    await this.assertV2Ready();

    const rows = await this.prisma.$queryRawUnsafe(
      `
      SELECT r.id, r.draftId, r.section, r.status, r.reviewStatus, r.provider, r.model, r.prompt, r.output, r.safetyFlags, r.errorMessage, r.createdAt, r.completedAt, d.creatorId
      FROM ai_generation_records r
      LEFT JOIN question_drafts d ON d.id = r.draftId
      WHERE r.id = ?
      LIMIT 1
      `,
      jobId,
    ) as Array<any>;

    if (rows.length === 0) throw new NotFoundException('Không tìm thấy tác vụ tạo bằng AI');

    const row = rows[0];
    if (user.role === 'LECTURER' && row.creatorId && row.creatorId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền truy cập tác vụ AI này');
    }
    const prompt = this.parseJson(row.prompt, {});
    if (
      user.role === 'LECTURER' &&
      !row.creatorId &&
      prompt?.requestedBy &&
      prompt.requestedBy !== user.id
    ) {
      throw new ForbiddenException('Bạn không có quyền truy cập tác vụ AI này');
    }

    return {
      jobId: row.id,
      draftId: row.draftId,
      section: row.section,
      status: row.status,
      reviewStatus: row.reviewStatus,
      provider: row.provider,
      model: row.model,
      output: this.parseJson(row.output, null),
      safetyFlags: this.parseJson(row.safetyFlags, null),
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
    };
  }
}
