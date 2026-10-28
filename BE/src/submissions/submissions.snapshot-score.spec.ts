import { ConflictException } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';

describe('SubmissionsService snapshot and score normalization', () => {
  const buildService = (prismaOverrides: Partial<any> = {}) => {
    const accessPolicy = {
      resolveClientIpFromParts: jest.fn().mockReturnValue('127.0.0.1'),
      isIpAllowedForExam: jest.fn().mockResolvedValue({ allowed: true }),
      logDeniedAccess: jest.fn(),
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
      enrollment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'enrollment-1' }),
      },
      examSnapshot: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      examSubmission: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      examInstance: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      submissionAnswer: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      questionStatistics: {
        upsert: jest.fn(),
      },
      proctoringSession: {
        upsert: jest.fn(),
      },
      integrityLog: {
        createMany: jest.fn(),
      },
      integrityReview: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
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
      questionId: 'question-1',
      questionVersionId: 'version-1',
      questionSnapshotId: 'snapshot-question-1',
      orderIndex: 0,
      assignedScore: 5,
      points: 5,
      payload: {
        type: 'MULTIPLE_CHOICE',
        stem: 'Frozen question 1',
        answerKey: { answer: 'A' },
        assignedScore: 5,
      },
      questionSnapshot: {
        id: 'snapshot-question-1',
        payload: {
          type: 'MULTIPLE_CHOICE',
          stem: 'Frozen question 1',
          answerKey: { answer: 'A' },
          assignedScore: 5,
        },
      },
    },
    {
      questionId: 'question-2',
      questionVersionId: 'version-2',
      questionSnapshotId: 'snapshot-question-2',
      orderIndex: 1,
      assignedScore: 15,
      points: 15,
      payload: {
        type: 'MULTIPLE_CHOICE',
        stem: 'Frozen question 2',
        answerKey: { answer: 'B' },
        assignedScore: 15,
      },
      questionSnapshot: {
        id: 'snapshot-question-2',
        payload: {
          type: 'MULTIPLE_CHOICE',
          stem: 'Frozen question 2',
          answerKey: { answer: 'B' },
          assignedScore: 15,
        },
      },
    },
  ];

  it('rejects starting a published exam without a snapshot', async () => {
    const { service } = buildService();

    await expect(
      service.startExam({ examId: 'exam-1' } as any, 'student-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('grades submit from immutable snapshot and stores normalized score on scale 10', async () => {
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
      exam: { id: 'exam-1', title: 'Midterm', totalPoints: 20 },
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
            exam: { id: 'exam-1', title: 'Midterm', totalPoints: 20 },
            answers: [],
          }),
        ),
      },
      submissionAnswer: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      questionStatistics: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      examInstance: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    prisma.$transaction.mockImplementation((callback) => callback(tx));

    const result = await service.submitExam(
      'submission-1',
      { answers: [{ questionId: 'question-1', answer: { answer: 'A' }, timeTaken: 30 }] } as any,
      'student-1',
    );

    expect(tx.submissionAnswer.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          questionId: 'question-1',
          questionVersionId: 'version-1',
          questionSnapshotId: 'snapshot-question-1',
          isCorrect: true,
          pointsAwarded: 5,
        }),
      ],
    });
    expect(tx.examSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'GRADED',
          score: 2.5,
        }),
      }),
    );
    expect(tx.examInstance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rawScore: 5,
          maxRawScore: 20,
          normalizedScore: 2.5,
        }),
      }),
    );
    expect(result).toMatchObject({
      rawScore: 5,
      maxRawScore: 20,
      normalizedScore: 2.5,
      score: 2.5,
    });
  });

  it('normalizes manual grading publish results using snapshot max raw score', async () => {
    const { service, prisma } = buildService();
    jest.spyOn(service, 'getManualGradingStatus').mockResolvedValue({
      hasManualGrading: true,
      canPublish: true,
      submissions: [{ submissionId: 'submission-1' }],
    } as any);
    prisma.submissionAnswer.findMany.mockResolvedValue([
      { submissionId: 'submission-1', pointsAwarded: 18 },
    ]);
    prisma.examSubmission.findMany.mockResolvedValue([
      {
        id: 'submission-1',
        examInstanceId: 'instance-1',
        examSnapshot: { questions: snapshotQuestions },
      },
    ]);
    prisma.examSubmission.update.mockResolvedValue({});
    prisma.examInstance.update.mockResolvedValue({});
    prisma.exam = { update: jest.fn().mockResolvedValue({}) } as any;
    prisma.$transaction.mockImplementation((cb: any) =>
      typeof cb === 'function' ? cb(prisma) : Promise.all(cb),
    );

    await service.publishExamResults('exam-1', { id: 'lecturer-1', role: 'LECTURER' });

    expect(prisma.examSubmission.update).toHaveBeenCalledWith({
      where: { id: 'submission-1' },
      data: expect.objectContaining({
        status: 'GRADED',
        score: 9,
      }),
    });
    expect(prisma.examInstance.update).toHaveBeenCalledWith({
      where: { id: 'instance-1' },
      data: expect.objectContaining({
        rawScore: 18,
        maxRawScore: 20,
        normalizedScore: 9,
      }),
    });
  });

  it('keeps the final score below 7.5 when five missed questions have higher coefficients', () => {
    const { service } = buildService();

    // 15 correct questions x 1 point; 5 missed questions x 2 points.
    const rawScore = 15;
    const maxRawScore = 15 + (5 * 2);

    expect((service as any).normalizeScore(rawScore, maxRawScore)).toBe(6);
  });

  it('returns during-review feedback per auto-graded question and never exposes manual grading data', () => {
    const { service } = buildService();
    const reviewSettings = {
      enabled: true,
      phases: {
        during: { showScore: true, showAnswers: true, showFeedback: true },
      },
    };

    const autoFeedback = (service as any).buildDuringReviewFeedback(
      {
        questionId: 'auto-1',
        type: 'MULTIPLE_CHOICE',
        answerKey: { answer: 'A' },
        assignedScore: 2,
        explanation: 'A is correct.',
      },
      { answer: 'A' },
      reviewSettings,
    );
    const manualFeedback = (service as any).buildDuringReviewFeedback(
      {
        questionId: 'manual-1',
        type: 'ESSAY',
        answerKey: { rubric: 'Instructor only' },
        assignedScore: 4,
        explanation: 'Private rubric.',
      },
      'Student essay',
      reviewSettings,
    );

    expect(autoFeedback).toEqual({
      questionId: 'auto-1',
      pointsAwarded: 2,
      maxPoints: 2,
      isCorrect: true,
      correctAnswer: { answer: 'A' },
      explanation: 'A is correct.',
    });
    expect(manualFeedback).toEqual({ questionId: 'manual-1', unavailable: true });
  });

  it('does not expose manual answers before grading, even after results are published', () => {
    const { service } = buildService();
    const view = service.sanitizeStudentSubmissionView({
      score: 8,
      exam: {
        resultsPublishedAt: new Date(),
        reviewSettings: {
          enabled: true,
          phases: { after: { showScore: true, showAnswers: true, showFeedback: true } },
        },
      },
      answers: [{
        isCorrect: false,
        pointsAwarded: 0,
        feedback: 'Private until manually graded.',
        manualGradedAt: null,
        question: { type: 'ESSAY', correctAnswer: { rubric: 'Private' }, explanation: 'Private' },
        questionSnapshot: { payload: { type: 'ESSAY', answerKey: { rubric: 'Private' }, explanation: 'Private', assignedScore: 4 } },
      }],
    });

    expect(view.answers[0].isCorrect).toBeUndefined();
    expect(view.answers[0].pointsAwarded).toBeUndefined();
    expect(view.answers[0].feedback).toBeUndefined();
    expect(view.answers[0].question.correctAnswer).toBeUndefined();
    expect(view.answers[0].question.explanation).toBeUndefined();
    expect(view.answers[0].gradingMode).toBe('MANUAL');
    expect(view.answers[0].maxPoints).toBe(4);
  });

  it('detects high-scoring submissions completed unusually fast using the exam time-limit precedence', () => {
    const { service } = buildService();

    const high = (service as any).getFastCompletionSignal({
      startedAt: new Date('2026-08-14T08:00:00.000Z'),
      submittedAt: new Date('2026-08-14T08:06:00.000Z'),
      score: 10,
      exam: { timeLimitMinutes: null, settings: { timeLimitMinutes: 45 }, duration: 60 },
    });
    const review = (service as any).getFastCompletionSignal({
      startedAt: new Date('2026-08-14T08:00:00.000Z'),
      submittedAt: new Date('2026-08-14T08:10:00.000Z'),
      score: 9,
      exam: { timeLimitMinutes: 45, settings: { timeLimitMinutes: 60 }, duration: 90 },
    });
    const ordinary = (service as any).getFastCompletionSignal({
      startedAt: new Date('2026-08-14T08:00:00.000Z'),
      submittedAt: new Date('2026-08-14T08:20:00.000Z'),
      score: 10,
      exam: { timeLimitMinutes: 45, duration: 45 },
    });

    expect(high).toMatchObject({ severity: 'HIGH', elapsedMinutes: 6, allowedMinutes: 45, scorePct: 100 });
    expect(review).toMatchObject({ severity: 'REVIEW', elapsedMinutes: 10, allowedMinutes: 45, scorePct: 90 });
    expect(ordinary).toBeNull();
  });

  it('finds pairs through rare wrong snapshot answers without comparing question positions', () => {
    const { service } = buildService();
    const answers: any[] = [];
    const studentIds = ['submission-a', 'submission-b', ...Array.from({ length: 18 }, (_, index) => `submission-${index + 3}`)];
    for (let question = 0; question < 10; question += 1) {
      for (const submissionId of studentIds) {
        const isCandidate = submissionId === 'submission-a' || submissionId === 'submission-b';
        const rareWrong = isCandidate && question < 3;
        answers.push({
          submissionId,
          questionId: `question-${question}`,
          questionVersionId: `version-${question}`,
          questionSnapshotId: `snapshot-${question}`,
          answer: { answer: rareWrong ? 'D' : 'A' },
          isCorrect: !rareWrong,
        });
      }
    }
    // Same option but a different immutable snapshot must not become evidence.
    answers.push({ submissionId: 'submission-a', questionId: 'legacy-a', questionVersionId: 'legacy-version-a', questionSnapshotId: 'snapshot-a', answer: { answer: 'C' }, isCorrect: false });
    answers.push({ submissionId: 'submission-b', questionId: 'legacy-b', questionVersionId: 'legacy-version-b', questionSnapshotId: 'snapshot-b', answer: { answer: 'C' }, isCorrect: false });

    const studentsBySubmissionId = new Map(studentIds.map((submissionId) => [
      submissionId,
      { studentId: submissionId.replace('submission-', 'student-'), studentName: submissionId, studentCode: null },
    ]));
    const pairs = (service as any).buildSimilarAnswerPairs({
      answers,
      studentsBySubmissionId,
      orderIndexByQuestionVersionId: new Map(Array.from({ length: 10 }, (_, index) => [`version-${index}`, index])),
    });

    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ rareWrongMatches: 3, comparableQuestions: 10, severity: 'REVIEW' });
    expect(pairs[0].evidence).toHaveLength(3);
    expect(pairs[0].evidence.every((item: any) => item.answer === 'D' && item.answerFrequency === 0.1)).toBe(true);

    const versionFallbackPairs = (service as any).buildSimilarAnswerPairs({
      answers: answers.slice(0, 200).map((answer) => ({ ...answer, questionSnapshotId: null })),
      studentsBySubmissionId,
      orderIndexByQuestionVersionId: new Map(Array.from({ length: 10 }, (_, index) => [`version-${index}`, index])),
    });
    expect(versionFallbackPairs).toHaveLength(1);
  });
});
