import { AIGenerationProcessor } from './ai-generation.processor';

describe('AIGenerationProcessor - exam-risk-assessment task', () => {
  const jobId = 'record-1';
  const examId = 'exam-1';
  const examInstanceId = 'instance-1';
  const submissionId = 'submission-1';

  const signals = {
    tabSwitchCount: 4,
    mouseAnomalies: 1,
    fullscreenExitCount: 2,
    focusLossCount: 1,
    pageHiddenCount: 4,
    tooFastAnswerCount: 1,
    totalAnswers: 10,
    totalIntegrityEvents: 8,
    eventBreakdown: { tab_switch: 4, fullscreen_exit: 2, blur: 1 },
  };

  const buildJobData = () => ({
    jobId,
    task: 'exam-risk-assessment',
    payload: {
      examId,
      submissionId,
      examInstanceId,
      submissionSummary: { attemptNo: 1, score: 65, durationMinutes: 60, timeSpentMinutes: 40 },
      signals,
      language: 'vi',
    },
  });

  const buildProcessor = (aiServiceOverrides: Partial<any> = {}) => {
    const prisma = {
      aIGenerationRecord: {
        findUnique: jest.fn().mockResolvedValue({ id: jobId, status: 'QUEUED' }),
        update: jest.fn().mockResolvedValue({}),
      },
      anomalyFlag: {
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
      assessExamIntegrityRisk: jest.fn(),
      ...aiServiceOverrides,
    };

    const config = { get: jest.fn().mockReturnValue(undefined) };
    const processor = new AIGenerationProcessor(prisma as any, aiService as any, config as any);
    return { processor, prisma, aiService };
  };

  describe('success flow', () => {
    it('stores the AI output and creates an OPEN anomaly flag tied to the exam instance', async () => {
      const { processor, prisma, aiService } = buildProcessor({
        assessExamIntegrityRisk: jest.fn().mockResolvedValue({
          riskScore: 78,
          riskLevel: 'HIGH',
          signals: [{ type: 'fullscreen_exit', description: 'Exited fullscreen twice.', weight: 0.6 }],
          explanation: 'Elevated fullscreen-exit and tab-switch frequency.',
          recommendReview: true,
        }),
      });

      await processor.process({ data: buildJobData() } as any);

      expect(aiService.assessExamIntegrityRisk).toHaveBeenCalledTimes(1);
      expect(prisma.aIGenerationRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: jobId },
          data: expect.objectContaining({
            status: 'SUCCEEDED',
            output: expect.objectContaining({ riskLevel: 'HIGH', riskScore: 78 }),
          }),
        }),
      );
      expect(prisma.anomalyFlag.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          examInstanceId,
          jobId,
          kind: 'AI_RISK_ASSESSMENT',
          score: 78,
          status: 'OPEN',
        }),
      });
    });

    it('skips anomaly flag creation when no examInstanceId is available', async () => {
      const { processor, prisma } = buildProcessor({
        assessExamIntegrityRisk: jest.fn().mockResolvedValue({
          riskScore: 10,
          riskLevel: 'LOW',
          signals: [],
          explanation: 'Nothing unusual detected.',
          recommendReview: false,
        }),
      });

      const jobData: any = buildJobData();
      jobData.payload.examInstanceId = null;

      await processor.process({ data: jobData } as any);

      expect(prisma.anomalyFlag.create).not.toHaveBeenCalled();
    });
  });

  describe('AI provider failure', () => {
    it('marks the job FAILED and creates no anomaly flag', async () => {
      const { processor, prisma, aiService } = buildProcessor({
        assessExamIntegrityRisk: jest
          .fn()
          .mockRejectedValue(new Error('AI generation failed: provider unavailable')),
      });

      await expect(processor.process({ data: buildJobData() } as any)).rejects.toThrow(
        'AI generation failed: provider unavailable',
      );

      expect(aiService.assessExamIntegrityRisk).toHaveBeenCalledTimes(1);
      expect(prisma.anomalyFlag.create).not.toHaveBeenCalled();
      expect(prisma.aIGenerationRecord.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: jobId },
          data: expect.objectContaining({
            status: 'FAILED',
            errorMessage: expect.stringContaining('provider unavailable'),
          }),
        }),
      );
    });
  });
});
