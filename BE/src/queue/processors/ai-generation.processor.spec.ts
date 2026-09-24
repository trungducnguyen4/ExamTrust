import { AIGenerationProcessor } from './ai-generation.processor';

describe('AIGenerationProcessor - exam-quality-review task', () => {
  const jobId = 'record-1';
  const examId = 'exam-1';

  const questionStats = [
    {
      questionId: 'q1',
      questionVersionId: 'qv1',
      questionText: 'What is 2+2?',
      totalAttempts: 8,
      correctRate: 12.5,
      incorrectRate: 87.5,
      skipRate: 0,
      avgTimeSeconds: 40,
      difficultyIndex: 0.9,
      discriminationIndex: -0.2,
    },
  ];

  const buildJobData = () => ({
    jobId,
    task: 'exam-quality-review',
    payload: {
      examId,
      examSummary: { totalSubmissions: 8, avgScorePct: 55, passRate: 40, completionRate: 80 },
      questionStats,
      language: 'vi',
    },
  });

  const buildProcessor = (aiServiceOverrides: Partial<any> = {}) => {
    const prisma = {
      aIGenerationRecord: {
        findUnique: jest.fn().mockResolvedValue({ id: jobId, status: 'QUEUED' }),
        update: jest.fn().mockResolvedValue({}),
      },
      examQualityReviewItem: {
        create: jest.fn().mockResolvedValue({}),
      },
      course: { findUnique: jest.fn() },
      questionVersion: { findUnique: jest.fn() },
      questionDraft: { findUnique: jest.fn() },
      exam: {
        findUnique: jest.fn().mockResolvedValue({
          id: examId,
          title: 'Midterm Exam',
          mode: 'NORMAL',
          status: 'PUBLISHED',
          course: { id: 'course-1', code: 'CS101', name: 'Intro to CS' },
        }),
      },
      $transaction: jest.fn((ops: Promise<any>[]) => Promise.all(ops)),
    };

    const aiService = {
      syncProviderFromRedis: jest.fn().mockResolvedValue(undefined),
      generateExamQualityReview: jest.fn(),
      ...aiServiceOverrides,
    };

    const config = { get: jest.fn().mockReturnValue(undefined) };
    const processor = new AIGenerationProcessor(prisma as any, aiService as any, config as any);
    return { processor, prisma, aiService };
  };

  describe('success flow', () => {
    it('stores the AI output on the job and creates one review item per suggestion', async () => {
      const { processor, prisma, aiService } = buildProcessor({
        generateExamQualityReview: jest.fn().mockResolvedValue({
          overallSummary: 'Overall the exam performs reasonably well.',
          suggestions: [
            {
              questionId: 'q1',
              severity: 'high',
              reasonSummary: 'Discrimination index is negative (-0.2) and 87.5% answered incorrectly.',
              recommendation: 'Review distractors; the correct option may be mislabeled.',
            },
          ],
        }),
      });

      await processor.process({ data: buildJobData() } as any);

      expect(aiService.generateExamQualityReview).toHaveBeenCalledTimes(1);
      expect(prisma.aIGenerationRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: jobId },
          data: expect.objectContaining({ status: 'RUNNING' }),
        }),
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.examQualityReviewItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          jobId,
          questionId: 'q1',
          questionVersionId: 'qv1',
          severity: 'high',
          reasonSummary: expect.stringContaining('Discrimination index'),
          recommendation: expect.stringContaining('distractors'),
        }),
      });
    });

    it('creates no review items when the AI finds no quality concerns', async () => {
      const { processor, prisma } = buildProcessor({
        generateExamQualityReview: jest.fn().mockResolvedValue({
          overallSummary: 'No concerning questions detected.',
          suggestions: [],
        }),
      });

      await processor.process({ data: buildJobData() } as any);

      expect(prisma.examQualityReviewItem.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalledWith([expect.anything()]);
    });
  });

  describe('AI provider failure', () => {
    it('marks the job FAILED with the provider error and creates no review items', async () => {
      const { processor, prisma, aiService } = buildProcessor({
        generateExamQualityReview: jest
          .fn()
          .mockRejectedValue(new Error('AI generation failed: provider timed out')),
      });

      await expect(processor.process({ data: buildJobData() } as any)).rejects.toThrow(
        'AI generation failed: provider timed out',
      );

      expect(aiService.generateExamQualityReview).toHaveBeenCalledTimes(1);
      expect(prisma.examQualityReviewItem.create).not.toHaveBeenCalled();
      expect(prisma.aIGenerationRecord.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: jobId },
          data: expect.objectContaining({
            status: 'FAILED',
            errorMessage: expect.stringContaining('provider timed out'),
          }),
        }),
      );
    });

    it('does nothing when the job record no longer exists', async () => {
      const { processor, prisma, aiService } = buildProcessor();
      prisma.aIGenerationRecord.findUnique.mockResolvedValue(null);

      await processor.process({ data: buildJobData() } as any);

      expect(aiService.generateExamQualityReview).not.toHaveBeenCalled();
      expect(prisma.aIGenerationRecord.update).not.toHaveBeenCalled();
    });
  });
});
