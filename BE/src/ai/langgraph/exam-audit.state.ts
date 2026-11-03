import { Annotation } from '@langchain/langgraph';

export interface AuditQuestion {
  questionId: string;
  orderIndex: number;
  type: string;
  content: string;
  options?: any;
  correctAnswer?: any;
  explanation?: string | null;
  difficulty: number;
  points?: number;
  bloomLevel?: 'REMEMBER' | 'UNDERSTAND' | 'APPLY' | 'ANALYZE' | 'EVALUATE' | 'CREATE';
}

export interface FlawedQuestion {
  questionId: string;
  flawType: 'AMBIGUOUS_OPTIONS' | 'MULTIPLE_CORRECT' | 'MISSING_DATA' | 'IMBALANCED_DIFFICULTY' | 'UNCLEAR_STEM';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  explanation: string;
  simulatedStudentPersona: 'EXCELLENT' | 'AVERAGE';
}

export interface QuestionImprovement {
  questionId: string;
  originalQuestion: AuditQuestion;
  flawSummary: string;
  improvedQuestion: AuditQuestion;
  improvementRationale: string;
}

export interface RubricScore {
  clarityScore: number;          // 0 - 100
  bloomBalanceScore: number;      // 0 - 100
  distractorQualityScore: number; // 0 - 100
  pacingScore: number;           // 0 - 100
  overallQualityScore: number;    // 0 - 100
  verdict: 'PASSED' | 'NEEDS_IMPROVEMENT';
}

export interface AuditTimelineEntry {
  step: number;
  agentName: 'Exam Architect' | 'Student Simulator' | 'Rubric Judge' | 'Report Synthesizer';
  action: string;
  timestamp: string;
  details?: Record<string, any>;
}

export interface ExamAuditReport {
  overallQualityScore: number;
  grade: 'EXCELLENT' | 'GOOD' | 'NEEDS_REVISION' | 'POOR';
  summary: string;
  metrics: RubricScore;
  totalQuestions: number;
  flawsCount: number;
  improvements: QuestionImprovement[];
  timeline: AuditTimelineEntry[];
  iterationCount: number;
  executedNodes: string[];
}

export const ExamAuditState = Annotation.Root({
  examId: Annotation<string>(),
  examTitle: Annotation<string>(),
  courseName: Annotation<string>(),
  maxIterations: Annotation<number>(),
  iterationCount: Annotation<number>(),
  questions: Annotation<AuditQuestion[]>(),
  flawedQuestions: Annotation<FlawedQuestion[]>(),
  rubricScore: Annotation<RubricScore>(),
  improvements: Annotation<QuestionImprovement[]>(),
  timeline: Annotation<AuditTimelineEntry[]>({
    reducer: (curr, update) => curr.concat(update),
    default: () => [],
  }),
  executedNodes: Annotation<string[]>({
    reducer: (curr, update) => curr.concat(update),
    default: () => [],
  }),
  finalReport: Annotation<ExamAuditReport | null>(),
  status: Annotation<'IN_PROGRESS' | 'PASSED' | 'NEEDS_REVISION' | 'COMPLETED'>(),
});
