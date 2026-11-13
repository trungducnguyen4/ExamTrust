import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiTelemetryService } from '../telemetry.service';
import { createExamAuditGraph } from './exam-audit.graph';
import { AuditQuestion, ExamAuditReport } from './exam-audit.state';

@Injectable()
export class ExamAuditService {
  private readonly logger = new Logger(ExamAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetryService: AiTelemetryService,
  ) {}

  async runExamAudit(params: {
    examId: string;
    maxIterations?: number;
    requestedBy?: string;
  }): Promise<ExamAuditReport> {
    const startTime = Date.now();
    const { examId, maxIterations = 2 } = params;

    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      include: {
        course: { select: { name: true, code: true } },
        examQuestions: {
          include: {
            question: true,
          },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!exam) {
      throw new NotFoundException(`Không tìm thấy bài thi với ID: ${examId}`);
    }

    const questions: AuditQuestion[] = exam.examQuestions.map((eq) => {
      let options = eq.question.options;
      if (typeof options === 'string') {
        try {
          options = JSON.parse(options);
        } catch {
          // ignore
        }
      }

      return {
        questionId: eq.question.id,
        orderIndex: eq.orderIndex,
        type: eq.question.type,
        content: eq.question.content,
        options,
        correctAnswer: eq.question.correctAnswer,
        explanation: eq.question.explanation,
        difficulty: Number(eq.question.difficulty || 0.5),
        points: Number(eq.question.points || 1),
      };
    });

    this.logger.log(
      `[LangGraph] Bắt đầu Autonomous Exam QA Squad cho bài thi: "${exam.title}" (${questions.length} câu hỏi)`,
    );

    const graph = createExamAuditGraph();
    const initialState = {
      examId: exam.id,
      examTitle: exam.title,
      courseName: exam.course?.name || 'Khóa học',
      maxIterations,
      iterationCount: 0,
      questions,
      flawedQuestions: [],
      improvements: [],
      timeline: [],
      executedNodes: [],
      finalReport: null,
      status: 'IN_PROGRESS' as const,
    };

    const finalState = await graph.invoke(initialState);
    const latencyMs = Date.now() - startTime;

    this.logger.log(
      `[LangGraph] Hoàn thành Autonomous Exam QA Squad sau ${latencyMs}ms (${finalState.iterationCount} vòng lặp, Điểm: ${finalState.finalReport?.overallQualityScore})`,
    );

    return (
      finalState.finalReport || {
        overallQualityScore: 80,
        grade: 'GOOD',
        summary: 'Thẩm định hoàn tất.',
        metrics: finalState.rubricScore || {
          clarityScore: 80,
          bloomBalanceScore: 80,
          distractorQualityScore: 80,
          pacingScore: 80,
          overallQualityScore: 80,
          verdict: 'PASSED',
        },
        totalQuestions: questions.length,
        flawsCount: 0,
        improvements: finalState.improvements || [],
        timeline: finalState.timeline || [],
        iterationCount: finalState.iterationCount || 1,
        executedNodes: finalState.executedNodes || [],
      }
    );
  }

  async applyAuditImprovements(params: {
    examId: string;
    improvements: Array<{
      questionId: string;
      improvedContent: string;
      improvedOptions?: any;
      improvedExplanation?: string;
    }>;
    userId?: string;
    userRole?: string;
    saveMode?: 'EXAM' | 'QUESTION_BANK';
  }) {
    const { examId, improvements, userId, userRole, saveMode = 'EXAM' } = params;

    if (!Array.isArray(improvements) || improvements.length === 0) {
      throw new BadRequestException('Danh sách câu hỏi cải tiến không được để trống');
    }

    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: {
        id: true,
        title: true,
        creatorId: true,
        courseId: true,
        status: true,
        startTime: true,
        endTime: true,
        duration: true,
        course: {
          select: {
            lecturerId: true,
          },
        },
        examQuestions: {
          select: {
            questionId: true,
            question: {
              select: {
                id: true,
                type: true,
                difficulty: true,
                points: true,
                defaultPoints: true,
                options: true,
                correctAnswer: true,
                explanation: true,
              },
            },
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
      throw new NotFoundException(`Không tìm thấy bài thi với ID: ${examId}`);
    }

    // 1. RBAC & IDOR check directly at the tool logic layer
    const role = String(userRole || '').toUpperCase();
    const isOwner = exam.creatorId === userId;
    const isCourseLecturer = exam.course?.lecturerId === userId;
    const isAdmin = role === 'ADMIN';

    if (userId && !isAdmin && !isOwner && !isCourseLecturer) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa câu hỏi của bài thi này');
    }

    // 2. Strict Invariant: Every improved question must actually belong to this exam!
    const validQuestionIds = new Set(exam.examQuestions.map((eq) => eq.questionId));
    for (const item of improvements) {
      if (!item.questionId || !validQuestionIds.has(item.questionId)) {
        throw new BadRequestException(
          `Câu hỏi với ID "${item.questionId}" không thuộc bài thi "${exam.title}" (ID: ${examId})`,
        );
      }

      const content = String(item.improvedContent || '').trim();
      if (!content) {
        throw new BadRequestException(`Nội dung câu hỏi "${item.questionId}" không được để trống`);
      }
      if (content.length > 10000) {
        throw new BadRequestException(`Nội dung câu hỏi "${item.questionId}" vượt quá giới hạn 10000 ký tự`);
      }
    }

    // 3. Lifecycle state verification
    const nowMs = Date.now();
    const hasStarted = exam.startTime ? nowMs >= new Date(exam.startTime).getTime() : false;
    const hasSubmissions = (exam._count?.submissions || 0) > 0;
    const notDraft = exam.status !== 'DRAFT';
    const isExamLocked = notDraft || hasSubmissions || hasStarted;

    // 4. Branch logic based on saveMode
    if (saveMode === 'QUESTION_BANK') {
      const createdQuestions = await this.prisma.$transaction(async (tx) => {
        const results: string[] = [];
        const eqMap = new Map(exam.examQuestions.map((eq) => [eq.questionId, eq.question]));

        for (const item of improvements) {
          const original = eqMap.get(item.questionId) as any;
          const rawContent = item.improvedContent.trim();
          const content = rawContent.startsWith('[AI Tinh chỉnh]')
            ? rawContent
            : `[AI Tinh chỉnh] ${rawContent}`;

          const created = await tx.question.create({
            data: {
              content,
              type: original?.type || 'MULTIPLE_CHOICE',
              options: item.improvedOptions !== undefined ? item.improvedOptions : (original?.options ?? undefined),
              correctAnswer: original?.correctAnswer ?? undefined,
              explanation: item.improvedExplanation?.trim() || original?.explanation || '',
              difficulty: original?.difficulty ?? 1,
              points: original?.points ?? 1,
              defaultPoints: original?.defaultPoints ?? undefined,
              courseId: exam.courseId || undefined,
              creatorId: userId || exam.creatorId,
              status: 'PUBLISHED',
              isReusable: true,
            },
            select: { id: true },
          });
          results.push(created.id);
        }
        return results;
      });

      this.logger.log(
        `[LangGraph] Người dùng ${userId || 'SYSTEM'} đã lưu an toàn ${createdQuestions.length} câu hỏi tinh chỉnh vào Ngân hàng câu hỏi (Khóa học: ${exam.courseId || 'Chung'})`,
      );

      return {
        success: true,
        savedToBank: true,
        appliedCount: createdQuestions.length,
        questionIds: createdQuestions,
        message: `Đã lưu thành công ${createdQuestions.length} câu hỏi tinh chỉnh vào Ngân hàng câu hỏi`,
      };
    }

    // saveMode === 'EXAM': Enforce strict lock if exam is ongoing, ended, or has submissions
    if (isExamLocked) {
      throw new ConflictException(
        'Không thể cập nhật trực tiếp câu hỏi vì bài thi đang diễn ra, đã kết thúc hoặc đã có bài nộp. Vui lòng chọn lưu vào Ngân hàng câu hỏi hoặc dùng tính năng Điều chỉnh điểm hậu kiểm.',
      );
    }

    // Atomic execution inside a Prisma transaction for DRAFT exam
    const updatedQuestions = await this.prisma.$transaction(async (tx) => {
      const results: string[] = [];
      for (const item of improvements) {
        const updated = await tx.question.update({
          where: { id: item.questionId },
          data: {
            content: item.improvedContent.trim(),
            options: item.improvedOptions ? item.improvedOptions : undefined,
            explanation: item.improvedExplanation?.trim(),
          },
          select: { id: true },
        });
        results.push(updated.id);
      }
      return results;
    });

    this.logger.log(
      `[LangGraph] Người dùng ${userId || 'SYSTEM'} đã áp dụng cải tiến an toàn cho ${updatedQuestions.length} câu hỏi của bài thi "${exam.title}"`,
    );

    return {
      success: true,
      savedToBank: false,
      appliedCount: updatedQuestions.length,
      questionIds: updatedQuestions,
    };
  }
}
