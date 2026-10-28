import { SubmissionsService } from './submissions.service';

describe('SubmissionsService manual-question isCorrect/statistics fix', () => {
  const buildService = (prismaOverrides: Partial<any> = {}) => {
    const accessPolicy = {
      resolveClientIpFromParts: jest.fn().mockReturnValue('127.0.0.1'),
      isIpAllowedForExam: jest.fn().mockResolvedValue({ allowed: true }),
      logDeniedAccess: jest.fn(),
      assertInstructorCanAccessSubmissionAnswer: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = {
      exam: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'exam-1',
          courseId: 'course-1',
          status: 'PUBLISHED',
          settings: {},
          duration: 60,
          timeLimitMinutes: 60,
          maxAttempts: 1,
          gradingStrategy: 'HIGHEST',
        }),
      },
      enrollment: { findFirst: jest.fn().mockResolvedValue({ id: 'enrollment-1' }) },
      examSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
      examSubmission: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      examInstance: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      submissionAnswer: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
      },
      questionStatistics: { upsert: jest.fn().mockResolvedValue({}) },
      examSubmissionRegradeLog: { create: jest.fn().mockResolvedValue({}) },
      proctoringSession: { upsert: jest.fn() },
      integrityLog: { createMany: jest.fn() },
      $transaction: jest.fn(),
      ...prismaOverrides,
    };

    const service = new SubmissionsService(
      prisma as any,
      { publishSubmissionEvent: jest.fn() } as any,
      accessPolicy as any,
      { isQueueOverloaded: jest.fn().mockResolvedValue(false) } as any,
      { suggestEssayGrade: jest.fn() } as any,
    );
    return { service, prisma, accessPolicy };
  };

  const snapshotQuestions = [
    {
      questionId: 'question-mc',
      questionVersionId: 'version-mc',
      questionSnapshotId: 'snapshot-mc',
      orderIndex: 0,
      assignedScore: 5,
      points: 5,
      payload: { type: 'MULTIPLE_CHOICE', stem: 'MC question', answerKey: { answer: 'A' }, assignedScore: 5 },
      questionSnapshot: { id: 'snapshot-mc', payload: { type: 'MULTIPLE_CHOICE', stem: 'MC question', answerKey: { answer: 'A' }, assignedScore: 5 } },
    },
    {
      questionId: 'question-essay',
      questionVersionId: 'version-essay',
      questionSnapshotId: 'snapshot-essay',
      orderIndex: 1,
      assignedScore: 10,
      points: 10,
      payload: { type: 'ESSAY', stem: 'Essay question', answerKey: null, assignedScore: 10 },
      questionSnapshot: { id: 'snapshot-essay', payload: { type: 'ESSAY', stem: 'Essay question', answerKey: null, assignedScore: 10 } },
    },
  ];

  it('submitExam leaves isCorrect=null (not false) and pointsAwarded=null for a manual (ESSAY) answer, while auto-grading MULTIPLE_CHOICE normally', async () => {
    const { service, prisma } = buildService();
    prisma.examSubmission.findUnique.mockResolvedValue({
      id: 'submission-1',
      examId: 'exam-1',
      studentId: 'student-1',
      status: 'IN_PROGRESS',
      attemptNo: 1,
      version: 0,
      submittedAt: null,
      gradedAt: null,
      score: null,
      examInstanceId: 'instance-1',
      examSnapshotId: 'snapshot-1',
      submitIdempotencyKey: null,
      submitLockedAt: null,
      student: { id: 'student-1', fullName: 'Student One', studentId: 'S001' },
      exam: { id: 'exam-1', title: 'Midterm', totalPoints: 15 },
    });

    const tx = {
      examSubmission: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'submission-1',
          examSnapshotId: 'snapshot-1',
          version: 1,
          exam: { id: 'exam-1', title: 'Midterm' },
          examSnapshot: { id: 'snapshot-1', questions: snapshotQuestions },
          answers: [],
          student: { id: 'student-1', fullName: 'Student One', studentId: 'S001' },
        }),
        update: jest.fn((args) =>
          Promise.resolve({
            id: 'submission-1',
            status: args.data.status,
            attemptNo: 1,
            submittedAt: args.data.submittedAt,
            gradedAt: args.data.gradedAt,
            score: args.data.score,
            version: 2,
            submitIdempotencyKey: null,
            student: { id: 'student-1', fullName: 'Student One', studentId: 'S001' },
            exam: { id: 'exam-1', title: 'Midterm', totalPoints: 15 },
            answers: [],
          }),
        ),
      },
      submissionAnswer: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      questionStatistics: { upsert: jest.fn().mockResolvedValue({}) },
      examInstance: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation((callback) => callback(tx));

    await service.submitExam(
      'submission-1',
      {
        answers: [
          { questionId: 'question-mc', answer: { answer: 'A' }, timeTaken: 30 },
          { questionId: 'question-essay', answer: { text: 'My essay response' }, timeTaken: 120 },
        ],
      } as any,
      'student-1',
    );

    expect(tx.submissionAnswer.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ questionId: 'question-mc', isCorrect: true, pointsAwarded: 5 }),
        expect.objectContaining({ questionId: 'question-essay', isCorrect: null, pointsAwarded: null }),
      ],
    });

    // Regression guard for the bug this test targets: a manual question must
    // never come back as isCorrect === false at submission time (that value
    // is reserved for "graded and wrong"), only null ("not graded yet").
    const essayRow = tx.submissionAnswer.createMany.mock.calls[0][0].data.find(
      (row: any) => row.questionId === 'question-essay',
    );
    expect(essayRow.isCorrect).toBeNull();
    expect(essayRow.isCorrect).not.toBe(false);

    // Submission still shows SUBMITTED (not GRADED) because the essay is pending.
    expect(tx.examSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUBMITTED' }) }),
    );

    // The submission-time QuestionStatistics pass must not bucket the
    // ungraded essay answer as "incorrect".
    const statsCalls = tx.questionStatistics.upsert.mock.calls;
    const essayStatsCall = statsCalls.find((call: any[]) => call[0].where.questionVersionId === 'version-essay');
    expect(essayStatsCall[0].create.incorrectAttempts).toBe(0);
    expect(essayStatsCall[0].create.correctAttempts).toBe(0);
  });

  it('gradeAnswer records the essay QuestionStatistics bucket only once graded, and shifts the bucket correctly on regrade', async () => {
    const { service, prisma } = buildService();

    const tx = {
      submissionAnswer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'answer-essay-1',
          submissionId: 'submission-1',
          questionId: 'question-essay',
          questionVersionId: 'version-essay',
          pointsAwarded: null,
          manualGradedAt: null,
          feedback: null,
          question: { points: 10, defaultPoints: 10 },
          questionVersion: { points: 10 },
          questionSnapshot: { payload: { assignedScore: 10 } },
        }),
        update: jest.fn().mockResolvedValue({ id: 'answer-essay-1' }),
      },
      examSubmissionRegradeLog: { create: jest.fn().mockResolvedValue({}) },
      questionStatistics: { upsert: jest.fn().mockResolvedValue({}) },
      examSubmission: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'submission-1',
          status: 'SUBMITTED',
          examSnapshot: { questions: snapshotQuestions },
          answers: [{ questionId: 'question-essay', pointsAwarded: 8, manualGradedAt: new Date() }],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      integrityReview: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    prisma.$transaction.mockImplementation((callback) => callback(tx));

    // First grade: award 8/10 points -> should count as "correct" (>0 points).
    await service.gradeAnswer(
      { submissionAnswerId: 'answer-essay-1', pointsAwarded: 8, feedback: 'Good job' } as any,
      { id: 'lecturer-1', role: 'LECTURER' },
    );

    expect(tx.questionStatistics.upsert).toHaveBeenCalledWith({
      where: { questionVersionId: 'version-essay' },
      create: expect.objectContaining({
        questionVersionId: 'version-essay',
        questionId: 'question-essay',
        totalAttempts: 1,
        correctAttempts: 1,
        incorrectAttempts: 0,
      }),
      update: expect.anything(),
    });

    // Now regrade down to 0 points -> should shift the bucket from correct to incorrect.
    tx.submissionAnswer.findUnique.mockResolvedValue({
      id: 'answer-essay-1',
      submissionId: 'submission-1',
      questionId: 'question-essay',
      questionVersionId: 'version-essay',
      pointsAwarded: 8,
      manualGradedAt: new Date(),
      feedback: 'Good job',
      question: { points: 10, defaultPoints: 10 },
      questionVersion: { points: 10 },
      questionSnapshot: { payload: { assignedScore: 10 } },
    });
    tx.questionStatistics.upsert.mockClear();

    await service.gradeAnswer(
      { submissionAnswerId: 'answer-essay-1', pointsAwarded: 0, feedback: 'Actually incorrect', reason: 'Regrade' } as any,
      { id: 'lecturer-1', role: 'LECTURER' },
    );

    expect(tx.questionStatistics.upsert).toHaveBeenCalledWith({
      where: { questionVersionId: 'version-essay' },
      create: expect.anything(),
      update: expect.objectContaining({
        correctAttempts: { increment: -1 },
        incorrectAttempts: { increment: 1 },
      }),
    });
  });
});
