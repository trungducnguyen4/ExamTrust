import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccessPolicyService } from '../common/services/access-policy.service';

import { CreateExamDto, UpdateExamDto, AddQuestionsToExamDto, UpdateExamQuestionDto, RescheduleExamDto } from './dto/exam.dto';
import { PaginationDto, buildPaginatedResult } from '../common/dto/pagination.dto';

const AUTO_GRADED_TYPES = new Set(['MULTIPLE_CHOICE', 'MULTI_SELECT', 'TRUE_FALSE', 'FIND_ERROR']);

// Once an exam leaves DRAFT, submissions may already reference its question
// snapshots and grading config — those must stay frozen. These are the only
// DTO fields still safe to change: they're read live by the exam-taking /
// grading flow (never from a per-submission snapshot), so editing them can't
// desync an already-taken or already-graded submission.
const LOCKED_EXAM_EDITABLE_TOP_LEVEL_FIELDS = new Set(['description', 'reviewSettings', 'settings']);
const LOCKED_EXAM_EDITABLE_SETTINGS_KEYS = new Set([
  'showResultImmediately',
  'allowLateSubmission',
  'webcamEvidencePolicy',
  'requiresProctoring',
  'proctoringEnabled',
  'devicePolicy',
]);

@Injectable()
export class ExamsService {
  private examQuestionVersionColumnExists: boolean | null = null;
  private examQuestionAssignedScoreColumnExists: boolean | null = null;

  constructor(
    private prisma: PrismaService,
    private readonly accessPolicy: AccessPolicyService,
  ) {}

  private async getCourseRecipientIds(courseId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId },
      select: { studentId: true },
    });
    return enrollments.map((e) => e.studentId);
  }

  private async hasExamQuestionVersionColumn(client: any): Promise<boolean> {
    if (this.examQuestionVersionColumnExists !== null) {
      return this.examQuestionVersionColumnExists;
    }

    const rows = await client.$queryRawUnsafe(
      `
      SELECT 1 AS ok
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'exam_questions'
        AND column_name = 'questionVersionId'
      LIMIT 1
      `,
    ) as Array<{ ok: number }>;

    this.examQuestionVersionColumnExists = rows.length > 0;
    return this.examQuestionVersionColumnExists;
  }

  private async hasExamQuestionAssignedScoreColumn(client: any): Promise<boolean> {
    if (this.examQuestionAssignedScoreColumnExists !== null) {
      return this.examQuestionAssignedScoreColumnExists;
    }

    const rows = await client.$queryRawUnsafe(
      `
      SELECT 1 AS ok
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'exam_questions'
        AND column_name = 'assignedScore'
      LIMIT 1
      `,
    ) as Array<{ ok: number }>;

    this.examQuestionAssignedScoreColumnExists = rows.length > 0;
    return this.examQuestionAssignedScoreColumnExists;
  }

  private async insertExamQuestionCompat(
    client: any,
    data: {
      examId: string;
      questionId: string;
      orderIndex: number;
      points?: number | null;
      questionVersionId?: string | null;
      assignedScore?: number | null;
    },
  ): Promise<string> {
    const id = randomUUID();
    const hasVersionColumn = await this.hasExamQuestionVersionColumn(client);
    const hasAssignedScoreColumn = await this.hasExamQuestionAssignedScoreColumn(client);

    if (hasVersionColumn) {
      if (hasAssignedScoreColumn) {
        await client.$executeRawUnsafe(
          `
          INSERT INTO exam_questions (id, examId, questionId, questionVersionId, orderIndex, points, assignedScore, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))
          `,
          id,
          data.examId,
          data.questionId,
          data.questionVersionId ?? null,
          data.orderIndex,
          data.points ?? 1,
          data.assignedScore ?? data.points ?? 1,
        );
      } else {
        await client.$executeRawUnsafe(
          `
          INSERT INTO exam_questions (id, examId, questionId, questionVersionId, orderIndex, points, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))
          `,
          id,
          data.examId,
          data.questionId,
          data.questionVersionId ?? null,
          data.orderIndex,
          data.points ?? 1,
        );
      }
    } else {
      if (hasAssignedScoreColumn) {
        await client.$executeRawUnsafe(
          `
          INSERT INTO exam_questions (id, examId, questionId, orderIndex, points, assignedScore, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))
          `,
          id,
          data.examId,
          data.questionId,
          data.orderIndex,
          data.points ?? 1,
          data.assignedScore ?? data.points ?? 1,
        );
      } else {
        await client.$executeRawUnsafe(
          `
          INSERT INTO exam_questions (id, examId, questionId, orderIndex, points, updatedAt)
          VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3))
          `,
          id,
          data.examId,
          data.questionId,
          data.orderIndex,
          data.points ?? 1,
        );
      }
    }

    return id;
  }

  private parseRawJson(value: any) {
    if (value === null || typeof value === 'undefined') return null;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(String(value));
    } catch {
      return null;
    }
  }

  private buildQuestionSnapshotPayload(examQuestion: any, questionVersion: any) {
    const question = examQuestion.question || {};
    const versionPayload = this.parseRawJson(questionVersion?.payload) || {};
    const questionOptions = this.parseRawJson(question.options);
    const questionCorrectAnswer = this.parseRawJson(question.correctAnswer);
    const type = String(question.type || versionPayload.type || '').trim();
    const stem = String(
      questionVersion?.stem ||
        versionPayload.stem ||
        versionPayload.content ||
        question.content ||
        '',
    ).trim();
    const options =
      typeof versionPayload.options !== 'undefined'
        ? versionPayload.options
        : questionOptions;
    const answerKey =
      questionVersion?.answerKey ??
      versionPayload.answerKey ??
      versionPayload.correctAnswer ??
      questionCorrectAnswer ??
      null;
    const explanation =
      questionVersion?.explanation ??
      versionPayload.explanation ??
      question.explanation ??
      null;
    const assignedScore = Number(examQuestion.assignedScore ?? examQuestion.points ?? questionVersion?.points ?? question.defaultPoints ?? question.points ?? 1);

    if (!stem) {
      throw new BadRequestException(`Không thể lưu snapshot câu hỏi ${examQuestion.questionId}: thiếu nội dung câu hỏi`);
    }

    if (AUTO_GRADED_TYPES.has(type.toUpperCase()) && (answerKey === null || typeof answerKey === 'undefined')) {
      throw new BadRequestException(`Không thể lưu snapshot câu hỏi ${examQuestion.questionId}: thiếu đáp án`);
    }

    return {
      questionId: examQuestion.questionId,
      questionVersionId: questionVersion?.id ?? examQuestion.questionVersionId ?? null,
      type,
      stem,
      content: stem,
      options,
      answerKey,
      correctAnswer: answerKey,
      explanation,
      assignedScore,
      points: assignedScore,
      difficulty: questionVersion?.difficulty ?? versionPayload.difficulty ?? question.difficulty ?? null,
      versionNo: questionVersion?.versionNo ?? versionPayload.versionNo ?? null,
    };
  }

  private async loadExamQuestionsCompat(examId: string, includeCorrectAnswer: boolean) {
    const rows = await this.prisma.$queryRawUnsafe(
      `
      SELECT
        eq.id,
        eq.examId,
        eq.questionId,
        eq.questionVersionId,
        eq.orderIndex,
        eq.points,
        eq.assignedScore,
        COALESCE(qv.stem, q.content) AS content,
        COALESCE(qv.payload, q.options) AS options,
        COALESCE(qv.answerKey, q.correctAnswer) AS correctAnswer,
        COALESCE(qv.explanation, q.explanation) AS explanation,
        COALESCE(qv.difficulty, q.difficulty) AS difficulty,
        COALESCE(qv.points, q.defaultPoints, q.points) AS questionPoints,
        COALESCE(qv.versionNo, 0) AS versionNo,
        q.type,
        q.courseId,
        q.creatorId,
        q.createdAt,
        q.updatedAt,
        q.mediaUrl,
        q.mediaType
      FROM exam_questions eq
      LEFT JOIN question_versions qv
        ON qv.id COLLATE utf8mb4_unicode_ci = eq.questionVersionId COLLATE utf8mb4_unicode_ci
      LEFT JOIN questions q
        ON q.id COLLATE utf8mb4_unicode_ci = eq.questionId COLLATE utf8mb4_unicode_ci
      WHERE eq.examId COLLATE utf8mb4_unicode_ci = ?
      ORDER BY eq.orderIndex ASC
      `,
      examId,
    ) as Array<any>;

    return rows.map((row) => ({
      id: row.id,
      examId: row.examId,
      questionId: row.questionId,
      questionVersionId: row.questionVersionId ?? null,
      orderIndex: Number(row.orderIndex || 0),
      points: row.assignedScore ?? row.points ?? 1,
      assignedScore: row.assignedScore ?? row.points ?? 1,
      question: {
        id: row.questionId,
        type: row.type,
        content: row.content,
        options: this.parseRawJson(row.options),
        correctAnswer: includeCorrectAnswer ? this.parseRawJson(row.correctAnswer) : undefined,
        explanation: row.explanation,
        difficulty: row.difficulty,
        points: row.questionPoints,
        courseId: row.courseId,
        creatorId: row.creatorId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        mediaUrl: row.mediaUrl ?? null,
        mediaType: row.mediaType ?? null,
        // MySQL's COALESCE(intCol, 0) widens the result to BIGINT, so Prisma
        // returns this as a JS BigInt even though the schema column is Int —
        // JSON.stringify can't serialize BigInt, so it must be converted.
        versionNo: Number(row.versionNo ?? 0),
      },
    }));
  }

  async create(createExamDto: CreateExamDto, creatorId: string, creatorRole?: string) {
    const { questionIds, ...examData } = createExamDto;
    const settings = (createExamDto as any).settings || (examData as any).settings || {};
    const timeLimitMinutes =
      typeof createExamDto.timeLimitMinutes === 'number'
        ? createExamDto.timeLimitMinutes
        : typeof settings.timeLimitMinutes === 'number'
          ? settings.timeLimitMinutes
          : createExamDto.duration;
    const maxAttempts =
      typeof createExamDto.maxAttempts === 'number'
        ? createExamDto.maxAttempts
        : typeof settings.maxAttempts === 'number'
          ? settings.maxAttempts
          : null;
    const gradingStrategy =
      createExamDto.gradingStrategy ||
      settings.gradingStrategy ||
      null;
    const reviewSettings =
      createExamDto.reviewSettings ||
      settings.reviewSettings ||
      null;
    const questionSelectionConfig =
      createExamDto.questionSelectionConfig ||
      settings.questionSelectionConfig ||
      {
        sourceMethod: settings.sourceMethod || 'bank',
        shuffleQuestions: Boolean(settings.shuffleQuestions),
        requestedQuestionCount: Number(settings.requestedQuestionCount || 0) || null,
        topicAllocations: Array.isArray(settings.topicAllocations) ? settings.topicAllocations : [],
      };
    const requestedCount = Number(settings.requestedQuestionCount || 0);
    const sourceMethod = settings.sourceMethod || 'bank';
    const normalizedType = this.normalizeQuestionType(settings.questionType);
    const bankDifficulty = settings.bankDifficulty;
    const topicAllocations = Array.isArray(settings.topicAllocations)
      ? settings.topicAllocations
          .map((item: any) => ({
            topicId: String(item?.topicId || '').trim(),
            count: Math.max(0, Number(item?.count || 0)),
          }))
          .filter((item: any) => item.topicId && item.count > 0)
      : [];

    // Check if course exists
    const course = await this.prisma.course.findUnique({
      where: { id: createExamDto.courseId },
    });

    if (!course) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }

    if (String(creatorRole || '').toUpperCase() === 'LECTURER' && course.lecturerId !== creatorId) {
      throw new ForbiddenException('Bạn không có quyền tạo bài thi cho khóa học này');
    }

    // Use transaction: create exam + attach questions atomically
    let createdExam = await this.prisma.$transaction(async (tx) => {
      const exam = await tx.exam.create({
        data: {
          ...examData,
          creatorId,
          startTime: examData.startTime ? new Date(examData.startTime) : null,
          endTime: examData.endTime ? new Date(examData.endTime) : null,
          timeLimitMinutes: timeLimitMinutes ?? null,
          maxAttempts: maxAttempts ?? null,
          gradingStrategy: gradingStrategy ?? null,
          reviewSettings: reviewSettings ?? null,
          questionSelectionConfig: questionSelectionConfig ?? null,
        },
        include: {
          course: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          creator: {
            select: {
              id: true,
              fullName: true,
            },
          },
        },
      });

      // Add questions if provided
      if (questionIds && questionIds.length > 0) {
        const versionRows = await tx.questionVersion.findMany({
          where: { questionId: { in: questionIds } },
          orderBy: [
            { questionId: 'asc' },
            { versionNo: 'desc' },
          ],
          select: {
            id: true,
            questionId: true,
          },
        });
        const latestVersionByQuestionId = new Map<string, string>();
        for (const version of versionRows) {
          if (!latestVersionByQuestionId.has(version.questionId)) {
            latestVersionByQuestionId.set(version.questionId, version.id);
          }
        }

        for (let i = 0; i < questionIds.length; i++) {
          const questionId = questionIds[i];
          const question = await tx.question.findUnique({
            where: { id: questionId },
            select: {
              id: true,
              points: true,
              defaultPoints: true,
            },
          });

          if (!question) {
            throw new BadRequestException(`Không tìm thấy câu hỏi: ${questionId}`);
          }

          const questionVersionId = latestVersionByQuestionId.get(questionId);
          if (!questionVersionId) {
            throw new BadRequestException(`Câu hỏi ${questionId} chưa có phiên bản và không thể đưa vào đề thi`);
          }

          await this.insertExamQuestionCompat(tx, {
              examId: exam.id,
              questionId,
              orderIndex: i + 1,
              points: Math.max(1, Math.round(Number(question.defaultPoints ?? question.points ?? 1))),
              assignedScore: Number(question.defaultPoints ?? question.points ?? 1) || 1,
              questionVersionId,
            });
        }
      }

        // Add random bank questions after any explicitly selected questions.
        const requestedCount = (createExamDto as any).settings?.requestedQuestionCount ||
          (examData as any).settings?.requestedQuestionCount || 0;

        const sourceMethod = (createExamDto as any).settings?.sourceMethod ||
          (examData as any).settings?.sourceMethod || 'bank';

        // Only auto-fill for bank source and a positive requestedCount
        if (sourceMethod === 'bank' && (requestedCount > 0 || topicAllocations.length > 0)) {
            // Build base where clause: same course
            const baseWhere: any = { courseId: createExamDto.courseId };

            // Optionally filter by questionType if provided in settings
            if (normalizedType) {
              baseWhere.type = normalizedType;
            }

            // Optionally filter by target difficulty from settings (0.3 / 0.5 / 0.7)
            if (bankDifficulty && bankDifficulty !== 'mixed') {
              const parsed = Number(bankDifficulty);
              if (!Number.isNaN(parsed)) {
                const center = Math.max(1, Math.min(5, Math.round(parsed * 4 + 1)));
                baseWhere.difficulty = {
                  gte: Math.max(1, center - 1),
                  lte: Math.min(5, center + 1),
                };
              }
            }

            const pickRandomQuestions = (items: any[], count: number) => {
              const shuffled = [...items];
              for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
              }
              return shuffled.slice(0, count);
            };

            const selectedQuestions: any[] = [];
            const usedQuestionIds = new Set<string>(questionIds || []);

            if (topicAllocations.length > 0) {
              const difficultyGte = Number((baseWhere as any)?.difficulty?.gte);
              const difficultyLte = Number((baseWhere as any)?.difficulty?.lte);
              const hasDifficultyRange = !Number.isNaN(difficultyGte) && !Number.isNaN(difficultyLte);

              const totalRequestedFromTopics = topicAllocations.reduce((sum, item) => sum + item.count, 0);
              if (requestedCount > 0 && totalRequestedFromTopics !== requestedCount) {
                throw new BadRequestException(
                  `Tổng số câu hỏi phân theo chủ đề phải bằng ${requestedCount}. Hiện tại là ${totalRequestedFromTopics}.`,
                );
              }

              for (const allocation of topicAllocations) {
                const topicWhereParts: string[] = [
                  'q.courseId COLLATE utf8mb4_unicode_ci = CAST(? AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci',
                  'qt.topicId COLLATE utf8mb4_unicode_ci = CAST(? AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci',
                ];
                const topicArgs: any[] = [createExamDto.courseId, allocation.topicId];

                if (normalizedType) {
                  topicWhereParts.push(
                    'q.type COLLATE utf8mb4_unicode_ci = CAST(? AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci',
                  );
                  topicArgs.push(normalizedType);
                }

                if (hasDifficultyRange) {
                  topicWhereParts.push('q.difficulty BETWEEN ? AND ?');
                  topicArgs.push(difficultyGte, difficultyLte);
                }

                const questionsForTopic = await tx.$queryRawUnsafe(
                  `
                  SELECT q.id, q.points, q.defaultPoints
                  FROM questions q
                  INNER JOIN question_topics qt
                    ON qt.questionId COLLATE utf8mb4_unicode_ci = q.id COLLATE utf8mb4_unicode_ci
                  WHERE ${topicWhereParts.join(' AND ')}
                    AND EXISTS (SELECT 1 FROM question_versions qv WHERE qv.questionId = q.id)
                  `,
                  ...topicArgs,
                ) as Array<{ id: string; points: number | null; defaultPoints: number | null }>;

                const available = questionsForTopic.filter((question) => !usedQuestionIds.has(question.id));
                if (available.length < allocation.count) {
                  throw new BadRequestException(
                    `Không đủ câu hỏi cho hạn mức đã chọn (${allocation.count}) ở chủ đề ${allocation.topicId}. Hiện có: ${available.length}.`,
                  );
                }

                const chosen = pickRandomQuestions(available, allocation.count);
                chosen.forEach((question) => {
                  usedQuestionIds.add(question.id);
                  selectedQuestions.push(question);
                });
              }
            } else {
              const selected = await tx.question.findMany({
                where: { ...baseWhere, versions: { some: {} } },
                take: Math.max(0, Number(requestedCount)),
                orderBy: { createdAt: 'desc' },
                select: {
                  id: true,
                  points: true,
                  defaultPoints: true,
                  latestVersionNo: true,
                },
              });

              if (selected.length === 0) {
                throw new BadRequestException(
                  'Không tìm thấy câu hỏi phù hợp trong ngân hàng câu hỏi với khóa học/loại/độ khó đã chọn. Vui lòng điều chỉnh bộ lọc hoặc thêm câu hỏi trước.',
                );
              }

              selectedQuestions.push(...selected);
            }

            if (selectedQuestions.length === 0) {
              throw new BadRequestException(
                'Không tìm thấy câu hỏi phù hợp trong ngân hàng câu hỏi với thiết lập đã chọn.',
              );
            }

            const selectedQuestionIds = Array.from(new Set(selectedQuestions.map((q) => q.id)));
            const latestVersions = await tx.questionVersion.findMany({
              where: { questionId: { in: selectedQuestionIds } },
              orderBy: [
                { questionId: 'asc' },
                { versionNo: 'desc' },
              ],
              select: {
                id: true,
                questionId: true,
                versionNo: true,
              },
            });
            const latestVersionByQuestionId = new Map<string, string>();
            for (const version of latestVersions) {
              if (!latestVersionByQuestionId.has(version.questionId)) {
                latestVersionByQuestionId.set(version.questionId, version.id);
              }
            }

            for (let i = 0; i < selectedQuestions.length; i++) {
              const question = selectedQuestions[i];
              const questionVersionId = latestVersionByQuestionId.get(question.id);
              if (!questionVersionId) {
                throw new BadRequestException(`Câu hỏi ${question.id} chưa có phiên bản và không thể đưa vào đề thi`);
              }
              await this.insertExamQuestionCompat(tx, {
                examId: exam.id,
                questionId: question.id,
                orderIndex: (questionIds?.length || 0) + i + 1,
                points: Math.max(1, Math.round(Number(question.defaultPoints ?? question.points ?? 1))),
                assignedScore: Number(question.defaultPoints ?? question.points ?? 1) || 1,
                questionVersionId,
              });
            }
        }

      // Return exam with counts so client shows question count and status immediately
      const createdExam = await tx.exam.findUnique({
        where: { id: exam.id },
        include: {
          course: { select: { id: true, code: true, name: true } },
          creator: { select: { id: true, fullName: true } },
          _count: { select: { examQuestions: true, submissions: true } },
        },
      });

      return createdExam;
    });

    if (createdExam?._count?.examQuestions > 0) {
      await this.publishExam(createdExam.id);
      createdExam = await this.prisma.exam.findUnique({
        where: { id: createdExam.id },
        include: {
          course: { select: { id: true, code: true, name: true } },
          creator: { select: { id: true, fullName: true } },
          _count: { select: { examQuestions: true, submissions: true } },
        },
      });
    }

    if (!createdExam) {
      throw new InternalServerErrorException('Bài thi đã được tạo nhưng không thể tải lại');
    }



    return createdExam;
  }

  async findAll(filters?: {
    courseId?: string;
    creatorId?: string;
    status?: string;
    includeArchived?: boolean;
    search?: string;
    timeRange?: string;
    sort?: string;
  }, pagination?: PaginationDto) {
    const andConditions: any[] = [{ deletedAt: null }];

    if (filters?.courseId) {
      andConditions.push({ courseId: filters.courseId });
    }

    if (filters?.creatorId) {
      andConditions.push({
        OR: [
          { creatorId: filters.creatorId },
          { course: { lecturerId: filters.creatorId } },
        ],
      });
    }

    if (filters?.status) {
      andConditions.push({ status: filters.status });
    } else if (!filters?.includeArchived) {
      andConditions.push({ status: { not: 'ARCHIVED' } });
    }

    if (filters?.search) {
      andConditions.push({
        OR: [
          { title: { contains: filters.search } },
          { course: { is: { OR: [{ code: { contains: filters.search } }, { name: { contains: filters.search } }] } } },
        ],
      });
    }

    const where: any = { AND: andConditions };

    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;

    const [exams, total] = await Promise.all([
      this.prisma.exam.findMany({
        where,
        include: {
          course: {
            select: {
              id: true,
              code: true,
              name: true,
              academicYear: true,
              term: true,
            },
          },
          creator: {
            select: {
              id: true,
              fullName: true,
            },
          },
          _count: {
            select: {
              examQuestions: true,
              submissions: true,
            },
          },
        },
        orderBy: filters?.sort === 'title' ? { title: 'asc' }
        : filters?.sort === 'startTime' ? { startTime: 'asc' }
        : filters?.sort === 'createdAt' ? { createdAt: 'desc' }
        : { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.exam.count({ where }),
    ]);

    return buildPaginatedResult(exams, total, page, limit);
  }

  async findOne(id: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, deletedAt: null },
      include: {
        course: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        creator: {
          select: {
            id: true,
            fullName: true,
          },
        },
        _count: {
          select: {
            submissions: true,
          },
        },
      },
    });

    if (!exam) {
      throw new NotFoundException('Không tìm thấy bài thi');
    }

    const examQuestions = await this.loadExamQuestionsCompat(id, true);
    return {
      ...exam,
      examQuestions,
    };
  }

  async findForStudent(id: string, studentId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, deletedAt: null, course: { status: { not: 'archived' } } },
      include: {
        course: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (!exam) {
      throw new NotFoundException('Không tìm thấy bài thi');
    }

    // Check if student is enrolled in the course
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        studentId,
        courseId: exam.courseId,
        status: 'active',
      },
    });

    if (!enrollment) {
      throw new ForbiddenException('Bạn chưa đăng ký khóa học này');
    }

    // A scheduled/published exam must not disclose its question payload before
    // its server-side opening time, nor after its closing time.  The schedule
    // endpoint supplies metadata for those states without exposing questions.
    if (exam.status !== 'PUBLISHED' && exam.status !== 'ONGOING') {
      throw new ForbiddenException('Bài thi hiện không khả dụng');
    }

    const now = new Date();
    if (exam.startTime && exam.startTime > now) {
      throw new ForbiddenException('Bài thi chưa bắt đầu');
    }
    if (exam.endTime && exam.endTime < now) {
      throw new ForbiddenException('Bài thi đã kết thúc');
    }

    const examQuestions = await this.loadExamQuestionsCompat(id, false);
    return {
      ...exam,
      examQuestions: examQuestions.map((eq) => ({
        ...eq,
        question: {
          id: eq.question.id,
          type: eq.question.type,
          content: eq.question.content,
          options: eq.question.options,
          points: eq.question.points,
          mediaUrl: eq.question.mediaUrl,
          mediaType: eq.question.mediaType,
        },
      })),
    };
  }

  async update(id: string, updateExamDto: UpdateExamDto) {
    const exam = await this.prisma.exam.findUnique({ where: { id } });

    if (!exam) {
      throw new NotFoundException('Không tìm thấy bài thi');
    }

    if (updateExamDto.status !== undefined) {
      throw new BadRequestException('Vui lòng dùng hành động công bố, lưu trữ hoặc khôi phục riêng để thay đổi trạng thái bài thi');
    }

    const { questionIds, ...rawUpdateData } = updateExamDto as any;
    let updateData: any = { ...rawUpdateData };

    if (exam.status !== 'DRAFT') {
      // Content/grading fields are frozen once submissions may reference this
      // exam's snapshots — only the narrow, live-read policy fields above stay
      // editable. See LOCKED_EXAM_EDITABLE_TOP_LEVEL_FIELDS for why each is safe.
      const disallowedKeys = Object.keys(rawUpdateData).filter(
        (key) => !LOCKED_EXAM_EDITABLE_TOP_LEVEL_FIELDS.has(key),
      );
      if (disallowedKeys.length > 0 || Array.isArray(questionIds)) {
        const blocked = [...disallowedKeys, ...(Array.isArray(questionIds) ? ['questionIds'] : [])];
        throw new ConflictException(
          `Bài thi đã công bố: chỉ có thể sửa mô tả, chính sách xem lại/công bố kết quả và cấu hình giám sát cho các lượt làm sau. Không thể sửa: ${blocked.join(', ')}.`,
        );
      }
      if (rawUpdateData.settings && typeof rawUpdateData.settings === 'object') {
        const currentSettings = (exam.settings as any) || {};
        const mergedSettings = { ...currentSettings };
        for (const key of LOCKED_EXAM_EDITABLE_SETTINGS_KEYS) {
          if (key in rawUpdateData.settings) mergedSettings[key] = rawUpdateData.settings[key];
        }
        updateData = { ...updateData, settings: mergedSettings };
      }
    }

    if (updateExamDto.startTime) {
      updateData.startTime = new Date(updateExamDto.startTime);
    }

    if (updateExamDto.endTime) {
      updateData.endTime = new Date(updateExamDto.endTime);
    }

    const updatedExam = await this.prisma.exam.update({
      where: { id },
      data: updateData,
      include: {
        course: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });

    if (Array.isArray(questionIds)) {
      await this.prisma.examQuestion.deleteMany({ where: { examId: id } });
      if (questionIds.length > 0) {
        await this.addQuestionsToExam(id, questionIds);
      }
    }

    return updatedExam;
  }

  async reschedule(id: string, rescheduleExamDto: RescheduleExamDto) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        course: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        _count: {
          select: {
            submissions: true,
          },
        },
      },
    });

    if (!exam) {
      throw new NotFoundException('Không tìm thấy bài thi');
    }

    if (exam.status === 'ONGOING') {
      throw new BadRequestException('Không thể đổi lịch bài thi đang diễn ra');
    }

    if (exam.status === 'COMPLETED' || exam.status === 'ARCHIVED') {
      throw new BadRequestException(`Không thể đổi lịch bài thi ở trạng thái ${exam.status}`);
    }

    const startTime = new Date(rescheduleExamDto.startTime);
    const endTime = new Date(rescheduleExamDto.endTime);

    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new BadRequestException('Thời gian bắt đầu hoặc kết thúc không hợp lệ');
    }

    if (exam._count.submissions > 0) {
      // A submission's deadline is resolved live as min(exam.endTime, startedAt
      // + timeLimit) — never snapshotted — so widening the window can only add
      // time, never take it away. Shrinking it could cut an in-progress
      // attempt short, so only a strict extension is allowed once anyone has
      // submitted.
      const extendsStart = !exam.startTime || startTime.getTime() <= exam.startTime.getTime();
      const extendsEnd = !exam.endTime || endTime.getTime() >= exam.endTime.getTime();
      if (!extendsStart || !extendsEnd) {
        throw new BadRequestException(
          'Bài thi đã có lượt làm bài: chỉ có thể kéo dài khung giờ (mở sớm hơn và/hoặc kết thúc muộn hơn lịch cũ), không thể rút ngắn.',
        );
      }
    } else if (exam.startTime && exam.startTime.getTime() <= Date.now()) {
      throw new BadRequestException('Không thể đổi lịch bài thi đã bắt đầu');
    }

    if (endTime <= startTime) {
      throw new BadRequestException('Thời gian kết thúc phải sau thời gian bắt đầu');
    }

    const availableWindowMinutes = (endTime.getTime() - startTime.getTime()) / 60000;
    if (availableWindowMinutes < exam.duration) {
      throw new BadRequestException(
        `Thời lượng bài thi (${exam.duration} phút) vượt quá khung giờ đã lên lịch`,
      );
    }

    const updatedExam = await this.prisma.exam.update({
      where: { id },
      data: {
        startTime,
        endTime,
      },
      include: {
        course: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
    });



    return updatedExam;
  }

  async remove(id: string, userId?: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        course: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    if (!exam || exam.deletedAt) {
      throw new NotFoundException('Không tìm thấy bài thi');
    }
    const submissionCount = await this.prisma.examSubmission.count({ where: { examId: id } });
    if (exam.status !== 'DRAFT' || submissionCount > 0) {
      throw new ConflictException('Bài thi đã có dữ liệu làm bài và không thể xóa. Hãy lưu trữ bài thi thay thế.');
    }
    await this.prisma.exam.update({ where: { id }, data: { deletedAt: new Date(), deletedById: userId ?? null } });
    return { message: 'Đã xóa bản nháp bài thi thành công' };
  }

  async archive(id: string, userId: string) {
    const exam = await this.prisma.exam.findFirst({ where: { id, deletedAt: null } });
    if (!exam) throw new NotFoundException('Không tìm thấy bài thi');
    if (exam.status === 'ARCHIVED') throw new ConflictException('Bài thi đã được lưu trữ');
    const inProgress = await this.prisma.examSubmission.count({ where: { examId: id, status: 'IN_PROGRESS' } });
    if (inProgress > 0) throw new ConflictException('Không thể lưu trữ bài thi khi đang có lượt làm bài diễn ra.');
    return this.prisma.exam.update({
      where: { id },
      data: { status: 'ARCHIVED', archivedAt: new Date(), archivedById: userId, archivedFromStatus: exam.status },
    });
  }

  async restore(id: string, userId: string) {
    const exam = await this.prisma.exam.findFirst({ where: { id, deletedAt: null } });
    if (!exam) throw new NotFoundException('Không tìm thấy bài thi');
    if (exam.status !== 'ARCHIVED') throw new ConflictException('Bài thi chưa được lưu trữ');
    const previous = exam.archivedFromStatus || 'DRAFT';
    const restoredStatus = previous === 'ONGOING' ? 'COMPLETED' : previous;
    return this.prisma.exam.update({
      where: { id },
      data: { status: restoredStatus, archivedAt: null, archivedById: null, archivedFromStatus: null },
    });
  }

  async addQuestionsToExam(examId: string, questionIds: string[]) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId } });

    if (!exam) {
      throw new NotFoundException('Không tìm thấy bài thi');
    }
    if (exam.status !== 'DRAFT') {
      throw new ConflictException('Chỉ có thể thay đổi câu hỏi khi bài thi ở trạng thái bản nháp');
    }

    // Get current max order index
    const maxOrder = await this.prisma.examQuestion.findFirst({
      where: { examId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });

    let orderIndex = (maxOrder?.orderIndex || 0) + 1;

    const examQuestions: any[] = [];
    const versionRows = await this.prisma.questionVersion.findMany({
      where: { questionId: { in: questionIds } },
      orderBy: [
        { questionId: 'asc' },
        { versionNo: 'desc' },
      ],
      select: {
        id: true,
        questionId: true,
      },
    });
    const latestVersionByQuestionId = new Map<string, string>();
    for (const version of versionRows) {
      if (!latestVersionByQuestionId.has(version.questionId)) {
        latestVersionByQuestionId.set(version.questionId, version.id);
      }
    }

    const questions = await this.prisma.question.findMany({
      where: { id: { in: questionIds } },
      select: { id: true, points: true, defaultPoints: true },
    });
    const questionById = new Map<string, any>(questions.map((q) => [q.id, q]));

    const existingExamQuestions = await this.prisma.examQuestion.findMany({
      where: {
        examId,
        questionId: { in: questionIds },
      },
      select: { questionId: true },
    });
    const existingQuestionIds = new Set(existingExamQuestions.map((eq) => eq.questionId));

    for (const questionId of questionIds) {
      const question = questionById.get(questionId);
      if (!question) {
        continue; // Skip invalid questions
      }

      if (!existingQuestionIds.has(questionId)) {
        const createdId = await this.insertExamQuestionCompat(this.prisma, {
          examId,
          questionId,
          orderIndex,
          points: Math.max(1, Math.round(Number(question.defaultPoints ?? question.points ?? 1))),
          assignedScore: Number(question.defaultPoints ?? question.points ?? 1) || 1,
          questionVersionId: latestVersionByQuestionId.get(questionId) ?? null,
        });
        examQuestions.push({
          id: createdId,
          examId,
          questionId,
          orderIndex,
          points: Math.max(1, Math.round(Number(question.points ?? question.defaultPoints ?? 1))),
          question,
        });
        orderIndex++;
      }
    }

    return examQuestions;
  }

  async removeQuestionFromExam(examId: string, questionId: string) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId }, select: { status: true } });
    if (!exam) throw new NotFoundException('Không tìm thấy bài thi');
    if (exam.status !== 'DRAFT') {
      throw new ConflictException('Chỉ có thể thay đổi câu hỏi khi bài thi ở trạng thái bản nháp');
    }

    const examQuestion = await this.prisma.examQuestion.findUnique({
      where: {
        examId_questionId: { examId, questionId },
      },
    });

    if (!examQuestion) {
      throw new NotFoundException('Không tìm thấy câu hỏi trong bài thi');
    }

    await this.prisma.examQuestion.delete({
      where: { id: examQuestion.id },
    });

    return { message: 'Đã xóa câu hỏi khỏi bài thi' };
  }

  async updateExamQuestion(
    examId: string,
    questionId: string,
    updateDto: UpdateExamQuestionDto,
  ) {
    const exam = await this.prisma.exam.findUnique({ where: { id: examId }, select: { status: true } });
    if (!exam) throw new NotFoundException('Không tìm thấy bài thi');
    if (exam.status !== 'DRAFT') {
      throw new ConflictException('Chỉ có thể thay đổi câu hỏi khi bài thi ở trạng thái bản nháp');
    }

    const examQuestion = await this.prisma.examQuestion.findUnique({
      where: {
        examId_questionId: { examId, questionId },
      },
    });

    if (!examQuestion) {
      throw new NotFoundException('Không tìm thấy câu hỏi trong bài thi');
    }

    return this.prisma.examQuestion.update({
      where: { id: examQuestion.id },
      data: {
        ...(typeof updateDto.orderIndex === 'number' ? { orderIndex: updateDto.orderIndex } : {}),
        ...(typeof updateDto.points === 'number'
          ? { points: updateDto.points, assignedScore: updateDto.points }
          : {}),
        ...(typeof updateDto.assignedScore === 'number'
          ? {
              assignedScore: updateDto.assignedScore,
              points: Math.max(1, Math.round(updateDto.assignedScore)),
            }
          : {}),
      },
      include: {
        question: true,
      },
    });
  }

  async publishExam(id: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id },
      include: {
        examQuestions: true,
      },
    });

    if (!exam) {
      throw new NotFoundException('Không tìm thấy bài thi');
    }

    if (exam.status !== 'DRAFT') {
      throw new ConflictException('Chỉ có thể công bố bài thi ở trạng thái bản nháp');
    }

    if (exam.examQuestions.length === 0) {
      throw new BadRequestException('Không thể công bố bài thi khi chưa có câu hỏi');
    }

    // Create exam snapshot and mark exam as PUBLISHED inside a transaction
    const publishedExam = await this.prisma.$transaction(async (tx) => {
      // fetch exam questions with ordering
      const examQuestions = await tx.examQuestion.findMany({
        where: { examId: id },
        include: {
          question: true,
          questionVersion: true,
        },
        orderBy: { orderIndex: 'asc' },
      });

      if (!examQuestions || examQuestions.length === 0) {
        throw new BadRequestException('Không thể công bố bài thi khi chưa có câu hỏi');
      }

      const examSnapshot = await tx.examSnapshot.create({
        data: {
          examId: id,
          title: exam.title,
          payload: {
            ...(this.parseRawJson(exam.settings) || {}),
            timeLimitMinutes: exam.timeLimitMinutes ?? null,
            maxAttempts: exam.maxAttempts ?? null,
            gradingStrategy: exam.gradingStrategy ?? null,
            reviewSettings: exam.reviewSettings ?? null,
            questionSelectionConfig: exam.questionSelectionConfig ?? null,
          },
          createdBy: exam.creatorId,
          publishedAt: new Date(),
        },
      });

      // For each exam question, materialize a QuestionSnapshot and ExamQuestionSnapshot
      for (const eq of examQuestions) {
        // determine questionVersionId: prefer examQuestion.questionVersionId else latest
        let questionVersionId = eq.questionVersionId;

        if (!questionVersionId) {
          const latest = await tx.questionVersion.findFirst({
            where: { questionId: eq.questionId },
            orderBy: { versionNo: 'desc' },
          });
          if (!latest) {
            throw new BadRequestException(`Thiếu phiên bản cho câu hỏi ${eq.questionId}`);
          }
          questionVersionId = latest.id;
        }

        const questionVersion =
          eq.questionVersion && eq.questionVersion.id === questionVersionId
            ? eq.questionVersion
            : await tx.questionVersion.findUnique({ where: { id: questionVersionId } });

        if (!questionVersion) {
          throw new BadRequestException(`Thiếu phiên bản cho câu hỏi ${eq.questionId}`);
        }

        const snapshotPayload = this.buildQuestionSnapshotPayload(eq, questionVersion);
        const assignedScore = Number(snapshotPayload.assignedScore || 1);

        // create a QuestionSnapshot for this question version
        const qSnapshot = await tx.questionSnapshot.create({
          data: {
            originalQuestionId: eq.questionId,
            questionVersionId: questionVersionId,
            payload: snapshotPayload,
          },
        });

        await tx.examQuestionSnapshot.create({
          data: {
            examSnapshotId: examSnapshot.id,
            questionId: eq.questionId,
            questionVersionId: questionVersionId,
            questionSnapshotId: qSnapshot.id,
            orderIndex: eq.orderIndex,
            points: Math.max(1, Math.round(assignedScore)),
            assignedScore,
            payload: snapshotPayload,
          },
        });
      }

      // finally mark exam published
      const updated = await tx.exam.update({ where: { id }, data: { status: 'PUBLISHED' } });
      return updated;
    });



    return publishedExam;
  }

  async getAvailableExamsForStudent(studentId: string) {
    // Get student's enrolled courses
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId,
        status: 'active',
      },
      select: {
        courseId: true,
      },
    });

    const courseIds = enrollments.map((e) => e.courseId);

    const now = new Date();

    const exams = await this.prisma.exam.findMany({
      where: {
        courseId: { in: courseIds },
        deletedAt: null,
        course: { status: { not: 'archived' } },
        status: { in: ['PUBLISHED', 'ONGOING'] },
        OR: [
          { startTime: null },
          { startTime: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { endTime: null },
              { endTime: { gte: now } },
            ],
          },
        ],
      },
      include: {
        course: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
        _count: {
          select: {
            examQuestions: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    return exams.filter((exam) => {
      const allowLateSubmission = Boolean((exam.settings as any)?.allowLateSubmission);
      if (allowLateSubmission) return true;
      if (!exam.endTime) return true;
      return exam.endTime >= now;
    });
  }

  async getCourseExamsForStudent(studentId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        studentId,
        courseId,
        status: 'active',
      },
      select: { id: true },
    });

    if (!enrollment) {
      throw new ForbiddenException('Bạn chưa đăng ký khóa học này');
    }

    return this.prisma.exam.findMany({
      where: {
        courseId,
        deletedAt: null,
        course: { status: { not: 'archived' } },
        status: { in: ['PUBLISHED', 'ONGOING', 'COMPLETED'] },
      },
      select: {
        id: true,
        title: true,
        status: true,
        startTime: true,
        endTime: true,
        duration: true,
        totalPoints: true,
        passingScore: true,
        maxAttempts: true,
        settings: true,
        course: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: [{ startTime: 'asc' }, { title: 'asc' }],
    });
  }

  async getScheduleForStudent(studentId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId,
        status: 'active',
      },
      select: {
        courseId: true,
      },
    });

    const courseIds = enrollments.map((e) => e.courseId);

    return this.prisma.exam.findMany({
      where: {
        courseId: { in: courseIds },
        deletedAt: null,
        course: { status: { not: 'archived' } },
        status: { in: ['PUBLISHED', 'ONGOING', 'COMPLETED'] },
      },
      select: {
        id: true,
        title: true,
        status: true,
        startTime: true,
        endTime: true,
        duration: true,
        totalPoints: true,
        passingScore: true,
        maxAttempts: true,
        settings: true,
        course: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: [{ startTime: 'asc' }, { title: 'asc' }],
    });
  }

  async getExamStats(examId: string) {
    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        submissions: {
          select: {
            studentId: true,
            score: true,
            status: true,
            submittedAt: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            examQuestions: true,
            submissions: true,
          },
        },
      },
    });

    if (!exam) {
      throw new NotFoundException('Không tìm thấy bài thi');
    }

    const isUnlimited = exam.maxAttempts === null || exam.maxAttempts === undefined;
    const scopedSubmissions = isUnlimited
      ? this.collapseLatestCompletedSubmissions(
          exam.submissions.filter((s) => s.status === 'GRADED'),
        )
      : exam.submissions.filter((s) => s.status === 'GRADED');
    const scores = scopedSubmissions.map((s) => s.score || 0);

    return {
      analyticsScope: isUnlimited ? 'PRACTICE' : 'OFFICIAL',
      isUnlimited,
      totalQuestions: exam._count.examQuestions,
      totalSubmissions: exam._count.submissions,
      analyzedSubmissions: scopedSubmissions.length,
      completedSubmissions: scopedSubmissions.length,
      averageScore: scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0,
      highestScore: scores.length > 0 ? Math.max(...scores) : 0,
      lowestScore: scores.length > 0 ? Math.min(...scores) : 0,
      passRate: exam.passingScore && scores.length > 0
        ? (scores.filter((s) => s >= exam.passingScore).length / scores.length) * 100
        : 0,
    };
  }

  private collapseLatestCompletedSubmissions<T extends { id: string; studentId?: string | null; status?: string | null; submittedAt?: Date | string | null; createdAt?: Date | string | null }>(submissions: T[]) {
    const buckets = new Map<string, T>();
    for (const submission of submissions) {
      const key = submission.studentId || submission.id;
      const prev = buckets.get(key);
      const prevTime = prev ? new Date(prev.submittedAt || prev.createdAt || 0).getTime() : -1;
      const nextTime = new Date(submission.submittedAt || submission.createdAt || 0).getTime();
      if (!prev || nextTime >= prevTime) {
        buckets.set(key, submission);
      }
    }
    return Array.from(buckets.values());
  }

  private normalizeQuestionType(rawType?: string): string | undefined {
    if (!rawType) return undefined;

    const map: Record<string, string> = {
      MIXED: '',
      CUSTOM: '',
      MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
      SINGLE_CHOICE: 'MULTIPLE_CHOICE',
      'SINGLE-CHOICE': 'MULTIPLE_CHOICE',
      'MULTIPLE-CHOICE': 'MULTIPLE_CHOICE',
      MULTI_SELECT: 'MULTI_SELECT',
      TRUE_FALSE: 'TRUE_FALSE',
      'TRUE-FALSE': 'TRUE_FALSE',
      SHORT_ANSWER: 'SHORT_ANSWER',
      'SHORT-ANSWER': 'SHORT_ANSWER',
      ESSAY: 'ESSAY',
      FILL_IN_BLANK: 'FILL_IN_BLANK',
      'FILL-BLANK': 'FILL_IN_BLANK',
      MATCHING: 'MATCHING',
      ORDERING: 'ORDERING',
      FIND_ERROR: 'FIND_ERROR',
      'FIND-ERROR': 'FIND_ERROR',
    };

    const normalized = map[String(rawType).trim().toUpperCase()];
    return normalized || undefined;
  }
}
