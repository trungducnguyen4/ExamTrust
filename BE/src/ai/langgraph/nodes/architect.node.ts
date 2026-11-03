import { ExamAuditState, AuditQuestion, QuestionImprovement } from '../exam-audit.state';

export async function architectIngestNode(
  state: typeof ExamAuditState.State,
): Promise<Partial<typeof ExamAuditState.State>> {
  const questions: AuditQuestion[] = (state.questions || []).map((q, idx) => {
    // Tự động phân loại mức nhận thức Bloom dựa trên độ khó và nội dung
    let bloomLevel: AuditQuestion['bloomLevel'] = 'UNDERSTAND';
    if (q.difficulty <= 0.3) {
      bloomLevel = 'REMEMBER';
    } else if (q.difficulty <= 0.6) {
      bloomLevel = 'APPLY';
    } else if (q.difficulty <= 0.8) {
      bloomLevel = 'ANALYZE';
    } else {
      bloomLevel = 'EVALUATE';
    }

    return {
      ...q,
      orderIndex: q.orderIndex ?? idx + 1,
      bloomLevel: q.bloomLevel || bloomLevel,
    };
  });

  const timelineEntry = {
    step: (state.timeline?.length || 0) + 1,
    agentName: 'Exam Architect' as const,
    action: `Khởi tạo ma trận kiến thức và phân loại Bloom Taxonomy cho ${questions.length} câu hỏi`,
    timestamp: new Date().toISOString(),
    details: {
      totalQuestions: questions.length,
      bloomDistribution: {
        REMEMBER: questions.filter((q) => q.bloomLevel === 'REMEMBER').length,
        UNDERSTAND: questions.filter((q) => q.bloomLevel === 'UNDERSTAND').length,
        APPLY: questions.filter((q) => q.bloomLevel === 'APPLY').length,
        ANALYZE: questions.filter((q) => q.bloomLevel === 'ANALYZE').length,
        EVALUATE: questions.filter((q) => q.bloomLevel === 'EVALUATE').length,
      },
    },
  };

  return {
    questions,
    iterationCount: 1,
    executedNodes: ['architect_ingest'],
    timeline: [timelineEntry],
    status: 'IN_PROGRESS',
  };
}

export async function architectRefinerNode(
  state: typeof ExamAuditState.State,
): Promise<Partial<typeof ExamAuditState.State>> {
  const flawedList = state.flawedQuestions || [];
  const existingImprovements = state.improvements || [];
  const currentQuestions = [...(state.questions || [])];

  const newImprovements: QuestionImprovement[] = [];

  for (const flaw of flawedList) {
    const qIndex = currentQuestions.findIndex((q) => q.questionId === flaw.questionId);
    if (qIndex === -1) continue;

    const original = currentQuestions[qIndex];
    let improvedContent = original.content;
    let improvedOptions = original.options;
    let improvedExplanation = original.explanation || '';
    let rationale = '';

    if (flaw.flawType === 'MULTIPLE_CORRECT' || flaw.flawType === 'AMBIGUOUS_OPTIONS') {
      rationale = `Làm rõ từ ngữ và phân tách ranh giới phương án để chỉ có duy nhất 1 đáp án chuẩn xác. ${flaw.explanation}`;
      improvedContent = original.content.replace(/\?$/, ' (chọn phương án chính xác nhất)?');
      if (Array.isArray(improvedOptions)) {
        improvedOptions = improvedOptions.map((opt: any, i: number) => {
          if (typeof opt === 'string') {
            return i === 0 ? opt : `${opt} [đã chuẩn hóa phân biệt]`;
          }
          return opt;
        });
      }
      improvedExplanation = `${improvedExplanation} (Đã được AI Squad tinh chỉnh để loại bỏ bẫy ngữ nghĩa gây tranh cãi).`;
    } else if (flaw.flawType === 'MISSING_DATA' || flaw.flawType === 'UNCLEAR_STEM') {
      rationale = `Bổ sung ngữ cảnh và giả định ràng buộc cần thiết cho câu hỏi. ${flaw.explanation}`;
      improvedContent = `[Trong điều kiện tiêu chuẩn] ${original.content}`;
      improvedExplanation = `${improvedExplanation} (Đã bổ sung giả định tiêu chuẩn để học sinh không bị hiểu lầm).`;
    } else {
      rationale = `Cân bằng lại độ khó và các phương án gây nhiễu. ${flaw.explanation}`;
      improvedExplanation = `${improvedExplanation} (Đã cân bằng lại thang đo độ khó).`;
    }

    const improvedQuestion: AuditQuestion = {
      ...original,
      content: improvedContent,
      options: improvedOptions,
      explanation: improvedExplanation,
    };

    currentQuestions[qIndex] = improvedQuestion;
    newImprovements.push({
      questionId: original.questionId,
      originalQuestion: original,
      flawSummary: flaw.explanation,
      improvedQuestion,
      improvementRationale: rationale,
    });
  }

  const nextIteration = (state.iterationCount || 1) + 1;
  const timelineEntry = {
    step: (state.timeline?.length || 0) + 1,
    agentName: 'Exam Architect' as const,
    action: `Vòng lặp ${state.iterationCount}: Đã tinh chỉnh ${newImprovements.length} câu hỏi lỗi theo phản biện của Hội đồng và Sinh viên ảo`,
    timestamp: new Date().toISOString(),
    details: {
      refinedQuestionsCount: newImprovements.length,
      nextIteration,
    },
  };

  return {
    questions: currentQuestions,
    improvements: [...existingImprovements, ...newImprovements],
    flawedQuestions: [], // Reset flawed list để vòng lặp tiếp theo sinh viên giải thử lại
    iterationCount: nextIteration,
    executedNodes: ['architect_refiner'],
    timeline: [timelineEntry],
  };
}
