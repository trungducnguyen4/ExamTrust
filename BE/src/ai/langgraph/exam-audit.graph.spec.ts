import { createExamAuditGraph } from './exam-audit.graph';
import { AuditQuestion } from './exam-audit.state';

describe('ExamAuditGraph (LangGraph Multi-Agent Squad)', () => {
  it('should run multi-agent feedback loop and improve flawed questions', async () => {
    const graph = createExamAuditGraph();

    const sampleQuestions: AuditQuestion[] = [
      {
        questionId: 'q-1',
        orderIndex: 1,
        type: 'MULTIPLE_CHOICE',
        content: 'Khái niệm nào sau đây KHÔNG thuộc về lập trình hướng đối tượng?',
        options: ['Đóng gói', 'Kế thừa', 'Đa hình', 'Tuần tự hóa'],
        correctAnswer: 'Tuần tự hóa',
        explanation: 'Tuần tự hóa là kỹ thuật lưu trữ/truyền tải dữ liệu, không phải trụ cột OOP.',
        difficulty: 0.4,
      },
      {
        questionId: 'q-2',
        orderIndex: 2,
        type: 'MULTIPLE_CHOICE',
        content: 'Thuật toán tìm kiếm nhị phân có độ phức tạp thời gian tốt nhất là bao nhiêu?',
        options: ['O(1)', 'O(log N)', 'O(N)', 'O(N log N)'],
        correctAnswer: 'O(1)',
        explanation: 'Khi phần tử cần tìm nằm ngay vị trí chính giữa mảng ban đầu.',
        difficulty: 0.85,
      },
      {
        questionId: 'q-3',
        orderIndex: 3,
        type: 'MULTIPLE_CHOICE',
        content: 'Giao thức nào hoạt động ở tầng Transport trong mô hình OSI?',
        options: ['TCP', 'UDP', 'Cả TCP và UDP', 'HTTP'],
        correctAnswer: 'Cả TCP và UDP',
        explanation: 'Cả TCP và UDP đều là giao thức tầng truyền vận.',
        difficulty: 0.5,
      },
    ];

    const initialState = {
      examId: 'test-exam-123',
      examTitle: 'Đề thi Kiểm thử LangGraph StateGraph',
      courseName: 'Kỹ thuật Phần mềm',
      maxIterations: 2,
      iterationCount: 0,
      questions: sampleQuestions,
      flawedQuestions: [],
      improvements: [],
      timeline: [],
      executedNodes: [],
      finalReport: null,
      status: 'IN_PROGRESS' as const,
    };

    const finalState = await graph.invoke(initialState);

    expect(finalState).toBeDefined();
    expect(finalState.status).toBe('COMPLETED');
    expect(finalState.finalReport).toBeDefined();

    // Xác nhận đã chạy qua các node của 3 Agent
    expect(finalState.executedNodes).toContain('architect_ingest');
    expect(finalState.executedNodes).toContain('student_simulator');
    expect(finalState.executedNodes).toContain('rubric_judge');
    expect(finalState.executedNodes).toContain('architect_refiner');
    expect(finalState.executedNodes).toContain('synthesizer');

    // Xác nhận Feedback loop đã chạy đủ 2 vòng lặp và tạo ra bản cải tiến
    expect(finalState.iterationCount).toBe(2);
    expect(finalState.finalReport?.improvements.length).toBeGreaterThan(0);
    expect(finalState.finalReport?.overallQualityScore).toBeGreaterThanOrEqual(80);

    // Xác nhận timeline lưu vết đầy đủ
    expect(finalState.timeline.length).toBeGreaterThanOrEqual(5);
  });
});
