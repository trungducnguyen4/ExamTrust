export type ExamTrustAiUseCase =
  | 'question_generation'
  | 'exam_generation'
  | 'draft_section'
  | 'topic_matching'
  | 'question_duplicate_detection'
  | 'grading_support'
  | 'exam_quality_review'
  | 'question_quality_improvement'
  | 'exam_risk_assessment';

export interface ExamTrustAiAnalyticsSummary {
  totalAttempts?: number;
  correctAttempts?: number;
  incorrectAttempts?: number;
  skippedAttempts?: number;
  passRate?: number;
  difficultyIndex?: number;
  discriminationIndex?: number;
  dominantWrongAnswer?: string;
  averageScore?: number;
}

export interface ExamTrustAiContext {
  courseId?: string;
  courseCode?: string;
  courseName?: string;
  courseDescription?: string;
  subjectCode?: string;
  examId?: string;
  examTitle?: string;
  examMode?: string;
  examStatus?: string;
  questionId?: string;
  questionVersionId?: string;
  questionVersionNo?: number;
  questionType?: string;
  questionCount?: number;
  difficulty?: number;
  attemptNo?: number;
  topicName?: string;
  topicDescription?: string;
  existingTopics?: string[];
  draftId?: string;
  draftMode?: string;
  draftStep?: string;
  currentStem?: string;
  instruction?: string;
  analytics?: ExamTrustAiAnalyticsSummary;
  extra?: Record<string, any>;
  userApiKey?: string;
  userProvider?: string;
  userModel?: string;
}

export interface ExamTrustAiPromptParams {
  appName: string;
  useCase: ExamTrustAiUseCase;
  language: string;
  questionType?: string;
  questionCount?: number;
  context?: ExamTrustAiContext;
}

export interface OllamaGenerationOptions {
  temperature: number;
  top_p: number;
  repeat_penalty: number;
  num_ctx: number;
}

const formatNumber = (value: any, digits = 2) => {
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return Number(num.toFixed(digits));
};

const stringifyValue = (value: any): string => {
  if (value === null || typeof value === 'undefined' || value === '') {
    return 'not provided';
  }
  if (typeof value === 'number') {
    return String(formatNumber(value, 4) ?? value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : 'not provided';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value).trim() || 'not provided';
};

const buildContextLines = (context?: ExamTrustAiContext): string[] => {
  if (!context) return [];

  const lines: string[] = [];
  const push = (label: string, value: any) => {
    if (typeof value === 'undefined' || value === null || value === '') return;
    lines.push(`- ${label}: ${stringifyValue(value)}`);
  };

  push('Course ID', context.courseId);
  push('Course code', context.courseCode);
  push('Course name', context.courseName);
  push('Course description', context.courseDescription);
  push('Subject code', context.subjectCode);
  push('Exam ID', context.examId);
  push('Exam title', context.examTitle);
  push('Exam mode', context.examMode);
  push('Exam status', context.examStatus);
  push('Question ID', context.questionId);
  push('Question version ID', context.questionVersionId);
  push('Question version no', context.questionVersionNo);
  push('Question type', context.questionType);
  push('Question count', context.questionCount);
  push('Difficulty', context.difficulty);
  push('Attempt no', context.attemptNo);
  push('Topic name', context.topicName);
  push('Topic description', context.topicDescription);
  push('Draft ID', context.draftId);
  push('Draft mode', context.draftMode);
  push('Draft step', context.draftStep);
  push('Current stem', context.currentStem);
  push('Instruction', context.instruction);

  if (context.analytics && Object.keys(context.analytics).length > 0) {
    lines.push(`- Analytics summary: ${stringifyValue(context.analytics)}`);
  }

  if (context.existingTopics && context.existingTopics.length > 0) {
    lines.push(`- Existing topics: ${context.existingTopics.slice(0, 10).join(', ')}`);
  }

  if (context.extra && Object.keys(context.extra).length > 0) {
    lines.push(`- Extra context: ${JSON.stringify(context.extra)}`);
  }

  return lines;
};

export function buildExamTrustPromptHeader(params: ExamTrustAiPromptParams): string {
  const { appName, useCase, language, questionType, questionCount, context } = params;
  const topicMatchingRules = useCase === 'topic_matching'
    ? [
      '- For topic matching, evaluate every existing topic relative to the proposed topic; preserve that direction.',
      '- Use the course context as the semantic boundary, not keyword overlap alone.',
      '- Treat every relation and score as lecturer-review evidence, never as an automatic taxonomy change.',
    ]
    : [];
  const useCaseLabel: Record<ExamTrustAiUseCase, string> = {
    question_generation: 'question generation',
    exam_generation: 'exam generation',
    draft_section: 'question draft editing',
    topic_matching: 'topic matching',
    question_duplicate_detection: 'question duplicate detection',
    grading_support: 'grading support',
    exam_quality_review: 'exam quality review',
    question_quality_improvement: 'question quality improvement',
    exam_risk_assessment: 'exam integrity risk assessment',
  };

  const lines = [
    `You are the official AI assistant for ${appName}.`,
    `Primary role: support lecturer/admin workflows for ${useCaseLabel[useCase]}.`,
    `Language target: ${language}.`,
    questionType ? `Preferred question type: ${questionType}.` : null,
    typeof questionCount === 'number' ? `Requested quantity: ${questionCount}.` : null,
    '',
    'Response rules:',
    '- Be academically rigorous, concise, and neutral.',
    '- Use the provided app context over guesses.',
    '- Do not change source data or claim to verify cheating.',
    '- If information is missing, keep the suggestion conservative.',
    '- Return only the requested JSON object when the task asks for structured output.',
    ...topicMatchingRules,
  ].filter(Boolean);

  const contextLines = buildContextLines(context);
  if (contextLines.length === 0) {
    lines.push('', 'Context: not provided.');
  } else {
    lines.push('', 'Context:', ...contextLines);
  }

  return lines.join('\n');
}

export function getOllamaGenerationOptions(useCase: ExamTrustAiUseCase): OllamaGenerationOptions {
  if (useCase === 'topic_matching') {
    return {
      temperature: 0.1,
      top_p: 0.8,
      repeat_penalty: 1.08,
      num_ctx: 4096,
    };
  }

  if (useCase === 'question_duplicate_detection') {
    return {
      temperature: 0.1,
      top_p: 0.8,
      repeat_penalty: 1.08,
      num_ctx: 8192,
    };
  }

  if (useCase === 'grading_support') {
    return {
      temperature: 0.15,
      top_p: 0.85,
      repeat_penalty: 1.1,
      num_ctx: 8192,
    };
  }

  return {
    temperature: 0.2,
    top_p: 0.85,
    repeat_penalty: 1.1,
    num_ctx: 8192,
  };
}
