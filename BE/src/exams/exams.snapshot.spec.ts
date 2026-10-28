import { BadRequestException } from '@nestjs/common';
import { ExamsService } from './exams.service';

describe('ExamsService snapshot publishing', () => {
  const buildService = (overrides: Partial<any> = {}) => {
    const tx = {
      examQuestion: {
        findMany: jest.fn().mockResolvedValue(overrides.examQuestions ?? []),
      },
      questionVersion: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      examSnapshot: {
        create: jest.fn().mockResolvedValue({ id: 'snapshot-1' }),
      },
      questionSnapshot: {
        create: jest.fn().mockResolvedValue({ id: 'question-snapshot-1' }),
      },
      examQuestionSnapshot: {
        create: jest.fn().mockResolvedValue({}),
      },
      exam: {
        update: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'PUBLISHED' }),
      },
    };
    const prisma = {
      exam: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(overrides.exam ?? { id: 'exam-1', status: 'DRAFT', title: 'Midterm', creatorId: 'lecturer-1', settings: {}, examQuestions: [{}] })
          .mockResolvedValueOnce(null),
      },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const service = new ExamsService(
      prisma as any,
      { createForUsers: jest.fn(), createForRole: jest.fn() } as any,
    );
    return { service, prisma, tx };
  };

  it('materializes complete immutable question payloads from version fields and legacy fallbacks', async () => {
    const { service, tx } = buildService({
      examQuestions: [
        {
          questionId: 'question-1',
          questionVersionId: 'version-1',
          orderIndex: 0,
          points: 20,
          assignedScore: 20,
          question: {
            id: 'question-1',
            type: 'MULTIPLE_CHOICE',
            content: 'legacy stem',
            options: { A: 'legacy A' },
            correctAnswer: { answer: 'B' },
            explanation: 'legacy explanation',
            difficulty: 2,
          },
          questionVersion: {
            id: 'version-1',
            versionNo: 3,
            stem: 'snapshot stem',
            payload: { options: { A: 'A', B: 'B' } },
            answerKey: { answer: 'A' },
            explanation: 'snapshot explanation',
            difficulty: 4,
            points: 10,
          },
        },
      ],
    });

    await service.publishExam('exam-1');

    expect(tx.questionSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload: expect.objectContaining({
          questionId: 'question-1',
          questionVersionId: 'version-1',
          stem: 'snapshot stem',
          content: 'snapshot stem',
          options: { A: 'A', B: 'B' },
          answerKey: { answer: 'A' },
          correctAnswer: { answer: 'A' },
          explanation: 'snapshot explanation',
          type: 'MULTIPLE_CHOICE',
          assignedScore: 20,
          points: 20,
        }),
      }),
    });
    expect(tx.examQuestionSnapshot.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        questionVersionId: 'version-1',
        assignedScore: 20,
        payload: expect.objectContaining({ answerKey: { answer: 'A' } }),
      }),
    });
  });

  it('rejects publishing auto-graded questions without an answer key', async () => {
    const { service } = buildService({
      examQuestions: [
        {
          questionId: 'question-1',
          questionVersionId: 'version-1',
          orderIndex: 0,
          points: 1,
          question: {
            id: 'question-1',
            type: 'TRUE_FALSE',
            content: 'Is this valid?',
            options: null,
            correctAnswer: null,
          },
          questionVersion: {
            id: 'version-1',
            stem: 'Is this valid?',
            payload: {},
            answerKey: null,
          },
        },
      ],
    });

    await expect(service.publishExam('exam-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
