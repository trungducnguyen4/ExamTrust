import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ExamAuditService } from './exam-audit.service';

describe('ExamAuditService - applyAuditImprovements Tool Security Lock', () => {
  let service: ExamAuditService;
  let mockPrisma: any;
  let mockTelemetry: any;

  beforeEach(() => {
    mockPrisma = {
      exam: {
        findUnique: jest.fn(),
      },
      question: {
        update: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
    };
    mockTelemetry = {
      generateTelemetry: jest.fn(),
    };
    service = new ExamAuditService(mockPrisma, mockTelemetry);
  });

  it('throws BadRequestException if improvements list is empty', async () => {
    await expect(
      service.applyAuditImprovements({
        examId: 'exam-1',
        improvements: [],
        userId: 'user-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException if exam is not found', async () => {
    mockPrisma.exam.findUnique.mockResolvedValue(null);

    await expect(
      service.applyAuditImprovements({
        examId: 'non-existent',
        improvements: [{ questionId: 'q-1', improvedContent: 'Updated stem' }],
        userId: 'user-1',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException (IDOR defense) if user is not creator or lecturer of the exam', async () => {
    mockPrisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1',
      title: 'Exam 1',
      creatorId: 'instructor-real',
      course: { lecturerId: 'instructor-real' },
      examQuestions: [{ questionId: 'q-1' }],
    });

    await expect(
      service.applyAuditImprovements({
        examId: 'exam-1',
        improvements: [{ questionId: 'q-1', improvedContent: 'Updated stem' }],
        userId: 'attacker-id',
        userRole: 'LECTURER',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws BadRequestException if questionId does NOT belong to the target exam (Cross-exam manipulation)', async () => {
    mockPrisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1',
      title: 'Exam 1',
      creatorId: 'instructor-1',
      course: { lecturerId: 'instructor-1' },
      examQuestions: [{ questionId: 'q-1' }, { questionId: 'q-2' }],
    });

    await expect(
      service.applyAuditImprovements({
        examId: 'exam-1',
        improvements: [{ questionId: 'q-foreign-99', improvedContent: 'Malicious modification' }],
        userId: 'instructor-1',
        userRole: 'LECTURER',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('applies improvements inside transaction when exam owner and questions match', async () => {
    mockPrisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1',
      title: 'Exam 1',
      creatorId: 'instructor-1',
      course: { lecturerId: 'instructor-1' },
      examQuestions: [{ questionId: 'q-1' }],
    });

    mockPrisma.question.update.mockResolvedValue({ id: 'q-1' });

    const result = await service.applyAuditImprovements({
      examId: 'exam-1',
      improvements: [
        {
          questionId: 'q-1',
          improvedContent: 'What is an ACID transaction in PostgreSQL?',
          improvedExplanation: 'ACID ensures Atomicity, Consistency, Isolation, Durability.',
        },
      ],
      userId: 'instructor-1',
      userRole: 'LECTURER',
    });

    expect(result.success).toBe(true);
    expect(result.appliedCount).toBe(1);
    expect(result.questionIds).toEqual(['q-1']);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(mockPrisma.question.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'q-1' },
        data: expect.objectContaining({
          content: 'What is an ACID transaction in PostgreSQL?',
        }),
      }),
    );
  });
});
