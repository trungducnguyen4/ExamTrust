import { ExamAuditState, RubricScore } from '../exam-audit.state';

export async function rubricJudgeNode(
  state: typeof ExamAuditState.State,
): Promise<Partial<typeof ExamAuditState.State>> {
  const questions = state.questions || [];
  const flaws = state.flawedQuestions || [];
  const currentIteration = state.iterationCount || 1;

  // 1. Độ rõ ràng & Tính khoa học (Clarity)
  // Mỗi lỗi trừ điểm tương ứng mức độ nghiêm trọng
  let clarityDeduction = 0;
  for (const f of flaws) {
    if (f.severity === 'HIGH') clarityDeduction += 15;
    else if (f.severity === 'MEDIUM') clarityDeduction += 8;
    else clarityDeduction += 4;
  }
  const clarityScore = Math.max(40, Math.min(100, 95 - clarityDeduction));

  // 2. Phân bố mức độ nhận thức Bloom (Bloom Balance)
  const bloomLevels = new Set(questions.map((q) => q.bloomLevel || 'UNDERSTAND'));
  const bloomBalanceScore = Math.min(100, 60 + bloomLevels.size * 10);

  // 3. Chất lượng phương án nhiễu (Distractor Quality)
  const distractorDeduction = flaws.filter((f) => f.flawType === 'AMBIGUOUS_OPTIONS').length * 12;
  const distractorQualityScore = Math.max(50, Math.min(100, 92 - distractorDeduction));

  // 4. Ước tính thời lượng & nhịp độ làm bài (Pacing)
  // Trắc nghiệm chuẩn 1.5 - 2 phút/câu
  const pacingScore = questions.length > 0 ? 90 : 70;

  // Điểm chất lượng tổng thể
  const overallQualityScore = Math.round(
    (clarityScore * 0.35) +
    (bloomBalanceScore * 0.25) +
    (distractorQualityScore * 0.25) +
    (pacingScore * 0.15),
  );

  const verdict: RubricScore['verdict'] =
    overallQualityScore >= 80 && flaws.length === 0 ? 'PASSED' : 'NEEDS_IMPROVEMENT';

  const rubricScore: RubricScore = {
    clarityScore,
    bloomBalanceScore,
    distractorQualityScore,
    pacingScore,
    overallQualityScore,
    verdict,
  };

  const timelineEntry = {
    step: (state.timeline?.length || 0) + 1,
    agentName: 'Rubric Judge' as const,
    action: `Vòng lặp ${currentIteration}: Hội đồng Khảo thí chấm đạt ${overallQualityScore}/100 điểm (Kết luận: ${verdict})`,
    timestamp: new Date().toISOString(),
    details: {
      scores: rubricScore,
      remainingFlaws: flaws.length,
      decision: verdict === 'PASSED' ? 'Chuyển sang Tổng hợp Báo cáo' : 'Yêu cầu Agent 1 Tinh chỉnh lại câu hỏi',
    },
  };

  return {
    rubricScore,
    executedNodes: ['rubric_judge'],
    timeline: [timelineEntry],
  };
}

export function shouldContinueAudit(state: typeof ExamAuditState.State): 'architect_refiner' | 'synthesizer' {
  const maxIterations = state.maxIterations || 2;
  const iterationCount = state.iterationCount || 1;
  const score = state.rubricScore?.overallQualityScore || 0;
  const hasFlaws = (state.flawedQuestions || []).length > 0;

  // Nếu điểm >= 80 và không còn câu hỏi lỗi -> Hoàn thành
  if (score >= 80 && !hasFlaws) {
    return 'synthesizer';
  }

  // Nếu đã đạt số vòng lặp tối đa -> Buộc phải xuất báo cáo tổng hợp
  if (iterationCount >= maxIterations) {
    return 'synthesizer';
  }

  // Tiếp tục vòng lặp phản biện: Chuyển sang Agent 1 (Architect Refiner)
  return 'architect_refiner';
}
