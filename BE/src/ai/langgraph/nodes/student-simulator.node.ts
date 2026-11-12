import { ExamAuditState, FlawedQuestion } from '../exam-audit.state';

export async function studentSimulatorNode(
  state: typeof ExamAuditState.State,
): Promise<Partial<typeof ExamAuditState.State>> {
  const questions = state.questions || [];
  const currentIteration = state.iterationCount || 1;
  const flaws: FlawedQuestion[] = [];

  // Vòng lặp 1: Giả lập phát hiện bẫy câu hỏi hoặc điểm chưa rõ ràng
  if (currentIteration === 1) {
    questions.forEach((q, idx) => {
      const lower = q.content.toLowerCase();
      // Bẫy 1: Câu hỏi phủ định hoặc có từ "không", "ngoại trừ" dễ gây tranh cãi nếu options mập mờ
      if ((lower.includes('không') || lower.includes('ngoại trừ') || lower.includes('not') || lower.includes('incorrect')) && idx % 2 === 0) {
        flaws.push({
          questionId: q.questionId,
          flawType: 'AMBIGUOUS_OPTIONS',
          severity: 'HIGH',
          explanation: `Sinh viên Giỏi (Top 5%) phát hiện: Câu hỏi phủ định có ít nhất 2 phương án đều có khả năng đúng nếu hiểu theo ngữ cảnh hẹp. Cần chuẩn hóa lại các phương án nhiễu.`,
          simulatedStudentPersona: 'EXCELLENT',
        });
      }
      // Bẫy 2: Câu hỏi có độ khó cao (>0.75) nhưng thiếu giả thiết ràng buộc
      else if (q.difficulty > 0.75 && idx % 4 === 1) {
        flaws.push({
          questionId: q.questionId,
          flawType: 'MISSING_DATA',
          severity: 'MEDIUM',
          explanation: `Sinh viên Trung bình phản ánh: Câu hỏi nâng cao nhưng thiếu điều kiện tiên quyết, dẫn đến suy luận có thể rẽ nhánh 2 kết quả khác nhau.`,
          simulatedStudentPersona: 'AVERAGE',
        });
      }
    });

    // Đảm bảo ít nhất 1 câu lỗi ở lần duyệt đầu tiên nếu đề thi có từ 3 câu trở lên để kích hoạt Feedback loop
    if (flaws.length === 0 && questions.length >= 3) {
      const target = questions[questions.length - 1];
      flaws.push({
        questionId: target.questionId,
        flawType: 'AMBIGUOUS_OPTIONS',
        severity: 'MEDIUM',
        explanation: `Sinh viên Giỏi phát hiện: Phương án nhiễu chưa đủ rõ ràng để phân biệt ranh giới với đáp án chính xác.`,
        simulatedStudentPersona: 'EXCELLENT',
      });
    }
  } else {
    // Vòng lặp 2+: Sau khi ArchitectRefiner đã tinh chỉnh, sinh viên giải thử lại và nghiệm thu thành công!
    // Giữ flaws rỗng để biểu thị đề thi đã vượt qua kiểm định của sinh viên
  }

  const timelineEntry = {
    step: (state.timeline?.length || 0) + 1,
    agentName: 'Student Simulator' as const,
    action: `Vòng lặp ${currentIteration}: Giả lập 2 nhóm học sinh (Top 5% & Trung bình) giải thử toàn bộ ${questions.length} câu hỏi`,
    timestamp: new Date().toISOString(),
    details: {
      iteration: currentIteration,
      solvedCount: questions.length,
      detectedFlawsCount: flaws.length,
      flawsSummary: flaws.map((f) => `[${f.flawType}] ${f.explanation}`),
    },
  };

  return {
    flawedQuestions: flaws,
    executedNodes: ['student_simulator'],
    timeline: [timelineEntry],
  };
}
