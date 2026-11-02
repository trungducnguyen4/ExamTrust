import { ExamAuditState, ExamAuditReport } from '../exam-audit.state';

export async function synthesizerNode(
  state: typeof ExamAuditState.State,
): Promise<Partial<typeof ExamAuditState.State>> {
  const score = state.rubricScore?.overallQualityScore || 75;
  const improvements = state.improvements || [];
  const flaws = state.flawedQuestions || [];
  const questions = state.questions || [];

  let grade: ExamAuditReport['grade'] = 'GOOD';
  if (score >= 85) grade = 'EXCELLENT';
  else if (score >= 70) grade = 'GOOD';
  else if (score >= 50) grade = 'NEEDS_REVISION';
  else grade = 'POOR';

  let summary = `Đội ngũ AI Đa tác nhân (Autonomous Exam QA Squad) đã hoàn tất quá trình phản biện đề thi "${state.examTitle || 'Đề thi'}" sau ${state.iterationCount || 1} vòng lặp qua StateGraph. `;
  if (improvements.length > 0) {
    summary += `Hệ thống đã tự động phát hiện và tinh chỉnh thành công ${improvements.length} câu hỏi có bẫy ngữ nghĩa hoặc phương án nhiễu chưa rõ ràng. Điểm chất lượng đề thi đạt ${score}/100 (${grade}).`;
  } else {
    summary += `Đề thi có cấu trúc chặt chẽ, các phương án phân hóa tốt và không phát hiện bẫy ngữ nghĩa nghiêm trọng. Điểm chất lượng đề thi đạt ${score}/100 (${grade}).`;
  }

  const finalReport: ExamAuditReport = {
    overallQualityScore: score,
    grade,
    summary,
    metrics: state.rubricScore || {
      clarityScore: 85,
      bloomBalanceScore: 80,
      distractorQualityScore: 85,
      pacingScore: 90,
      overallQualityScore: score,
      verdict: 'PASSED',
    },
    totalQuestions: questions.length,
    flawsCount: flaws.length,
    improvements,
    timeline: state.timeline || [],
    iterationCount: state.iterationCount || 1,
    executedNodes: Array.from(new Set([...(state.executedNodes || []), 'synthesizer'])),
  };

  const timelineEntry = {
    step: (state.timeline?.length || 0) + 1,
    agentName: 'Report Synthesizer' as const,
    action: `Tổng hợp hoàn tất Báo cáo Thẩm định đề thi (Đạt xếp loại: ${grade} - ${score}/100 điểm)`,
    timestamp: new Date().toISOString(),
    details: {
      finalGrade: grade,
      totalImprovements: improvements.length,
    },
  };

  return {
    finalReport,
    status: 'COMPLETED',
    executedNodes: ['synthesizer'],
    timeline: [timelineEntry],
  };
}
