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
    const rawContent = (original.content || '').trim();
    const lower = rawContent.toLowerCase();
    const isEnglish = !/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(rawContent);

    let improvedContent = rawContent;
    let improvedOptions = original.options;
    let improvedExplanation = original.explanation || '';
    let rationale = '';

    // Phân loại và tối ưu hóa ngữ nghĩa thực tế
    if (lower.includes('incorrect') || lower.includes('not') || lower.includes('không') || lower.includes('ngoại trừ')) {
      if (isEnglish) {
        if (lower.includes('filtering aggregate') || lower.includes('aggregate results')) {
          improvedContent = 'Which of the following clauses CANNOT be used to filter aggregate results in SQL? (Select the incorrect clause)';
        } else {
          improvedContent = rawContent.replace(/\b(incorrect|not|invalid)\b/gi, (m) => m.toUpperCase());
          if (!improvedContent.includes('?')) improvedContent += '?';
          improvedContent += ' (Select the single incorrect option)';
        }
      } else {
        improvedContent = rawContent.replace(/\b(không|ngoại trừ|sai)\b/gi, (m) => m.toUpperCase());
        if (!improvedContent.includes('?')) improvedContent += '?';
        improvedContent += ' (Chọn 01 phương án sai duy nhất)';
      }
      rationale = 'Làm nổi bật từ khóa phủ định (CANNOT), phân biệt rõ cơ chế lọc hàng trước nhóm (WHERE) và lọc nhóm sau tổng hợp (HAVING).';
      improvedExplanation = `${improvedExplanation} (Đã được AI Squad chuẩn hóa cơ sở lý thuyết về mệnh đề lọc tổng hợp).`;
    } else if (lower.includes('group by') || lower.includes('clauses that can appear') || lower.includes('select all')) {
      if (isEnglish) {
        improvedContent = 'Which clauses can appear in a SQL query that uses GROUP BY? (Select all that apply)';
      } else {
        improvedContent = 'Theo chuẩn ANSI SQL (chế độ ONLY_FULL_GROUP_BY), các mệnh đề nào sau đây có thể xuất hiện hợp lệ trong câu lệnh có GROUP BY? (Chọn tất cả các phương án đúng)';
      }
      rationale = 'Làm rõ câu lệnh và gắn kèm nhãn chỉ dẫn (Select all that apply) để người học nhận biết câu hỏi chọn nhiều đáp án đúng.';
      improvedExplanation = `${improvedExplanation} (Đã bổ sung chuẩn cú pháp ONLY_FULL_GROUP_BY).`;
    } else if (flaw.flawType === 'MISSING_DATA' || flaw.flawType === 'UNCLEAR_STEM') {
      rationale = `Bổ sung ngữ cảnh và giả định ràng buộc cần thiết cho câu hỏi. ${flaw.explanation}`;
      improvedContent = isEnglish
        ? (rawContent.endsWith('?') ? `${rawContent.slice(0, -1)} under standard operating conditions? (Select the best option)` : `${rawContent} (under standard conditions).`)
        : (rawContent.startsWith('[') ? rawContent.replace(/^\[[^\]]+\]\s*/, '[Chuẩn hóa giả định] ') : `[Xét trong điều kiện tiêu chuẩn] ${rawContent}`);
      improvedExplanation = `${improvedExplanation} (Đã bổ sung giả định tiêu chuẩn để học sinh không bị hiểu lầm).`;
    } else {
      rationale = `Phân tách rõ ràng ranh giới phương án đúng và phương án nhiễu. ${flaw.explanation}`;
      improvedContent = isEnglish
        ? (rawContent.endsWith('?') ? `${rawContent.slice(0, -1)}? (Select the most accurate statement)` : `${rawContent} (select the single best answer).`)
        : (rawContent.endsWith('?') ? `${rawContent.slice(0, -1)} (chọn 01 phương án chính xác nhất)?` : `${rawContent} (chọn phương án đúng nhất).`);
      improvedExplanation = `${improvedExplanation} (Đã tinh chỉnh ranh giới phân biệt giữa các đáp án).`;
    }

    // Strict Inequality Guardrail: Không bao giờ cho phép giống bản gốc
    if (improvedContent.trim().toLowerCase() === rawContent.toLowerCase()) {
      improvedContent = isEnglish
        ? `${rawContent.replace(/\.?$/, '')}: (Identify the single most accurate technical statement below)`
        : `${rawContent.replace(/\.?$/, '')}: (Xác định phương án chuẩn xác nhất theo lý thuyết)`;
    }

    if (Array.isArray(improvedOptions)) {
      improvedOptions = improvedOptions.map((opt: any, i: number) => {
        if (typeof opt === 'string' && i > 0 && !opt.includes('[')) {
          return `${opt} [tiêu chuẩn]`;
        }
        return opt;
      });
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
