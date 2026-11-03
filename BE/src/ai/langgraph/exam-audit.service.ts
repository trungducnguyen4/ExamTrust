import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
    userId: string;
  }) {
    const { examId, improvements, userId } = params;

    const exam = await this.prisma.exam.findUnique({
      where: { id: examId },
      select: { id: true, title: true },
    });

    if (!exam) {
      throw new NotFoundException(`Không tìm thấy bài thi với ID: ${examId}`);
    }

    const updatedQuestions: string[] = [];

    for (const item of improvements) {
      const updated = await this.prisma.question.update({
        where: { id: item.questionId },
        data: {
          content: item.improvedContent,
          options: item.improvedOptions ? item.improvedOptions : undefined,
          explanation: item.improvedExplanation,
        },
      });
      updatedQuestions.push(updated.id);
    }

    this.logger.log(
      `[LangGraph] Người dùng ${userId} đã áp dụng cải tiến cho ${updatedQuestions.length} câu hỏi của bài thi "${exam.title}"`,
    );

    return {
      success: true,
      appliedCount: updatedQuestions.length,
      questionIds: updatedQuestions,
    };
  }
}
