import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
        create: jest.fn(),
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

  it('throws ConflictException when exam is locked (ONGOING/COMPLETED/has submissions) in EXAM saveMode', async () => {
    mockPrisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1',
      title: 'Exam 1',
      creatorId: 'instructor-1',
      course: { lecturerId: 'instructor-1' },
      status: 'ONGOING',
      _count: { submissions: 5 },
      examQuestions: [{ questionId: 'q-1', question: { id: 'q-1', content: 'Old question' } }],
    });

    await expect(
      service.applyAuditImprovements({
        examId: 'exam-1',
        improvements: [{ questionId: 'q-1', improvedContent: 'Trying to mutate live exam question' }],
        userId: 'instructor-1',
        userRole: 'LECTURER',
        saveMode: 'EXAM',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('saves to Question Bank when saveMode is QUESTION_BANK even if exam is locked', async () => {
    mockPrisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1',
      title: 'Exam 1',
      creatorId: 'instructor-1',
      courseId: 'course-123',
      course: { lecturerId: 'instructor-1' },
      status: 'COMPLETED',
      _count: { submissions: 25 },
      examQuestions: [
        {
          questionId: 'q-1',
          question: {
            id: 'q-1',
            type: 'MULTIPLE_CHOICE',
            difficulty: 2,
            points: 1,
            options: ['A', 'B', 'C', 'D'],
            correctAnswer: 'B',
            explanation: 'Original explanation',
          },
        },
      ],
    });

    mockPrisma.question.create.mockResolvedValue({ id: 'new-q-bank-1' });

    const result = await service.applyAuditImprovements({
      examId: 'exam-1',
      improvements: [
        {
          questionId: 'q-1',
          improvedContent: 'In standard ANSI SQL, which clause filters aggregated rows?',
          improvedExplanation: 'HAVING filters aggregated rows after GROUP BY.',
        },
      ],
      userId: 'instructor-1',
      userRole: 'LECTURER',
      saveMode: 'QUESTION_BANK',
    });

    expect(result.success).toBe(true);
    expect(result.savedToBank).toBe(true);
    expect(result.appliedCount).toBe(1);
    expect(result.questionIds).toEqual(['new-q-bank-1']);
    expect(mockPrisma.question.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: '[AI Tinh chỉnh] In standard ANSI SQL, which clause filters aggregated rows?',
          courseId: 'course-123',
          status: 'PUBLISHED',
          isReusable: true,
        }),
      }),
    );
  });

  it('applies improvements directly to exam in DRAFT status when saveMode is EXAM', async () => {
    mockPrisma.exam.findUnique.mockResolvedValue({
      id: 'exam-1',
      title: 'Exam 1',
      creatorId: 'instructor-1',
      course: { lecturerId: 'instructor-1' },
      status: 'DRAFT',
      _count: { submissions: 0 },
      examQuestions: [{ questionId: 'q-1', question: { id: 'q-1' } }],
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
      saveMode: 'EXAM',
    });

    expect(result.success).toBe(true);
    expect(result.savedToBank).toBe(false);
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
