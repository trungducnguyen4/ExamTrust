import { StateGraph, START, END } from '@langchain/langgraph';
import { ExamAuditState } from './exam-audit.state';
import { architectIngestNode, architectRefinerNode } from './nodes/architect.node';
import { studentSimulatorNode } from './nodes/student-simulator.node';
import { rubricJudgeNode, shouldContinueAudit } from './nodes/rubric-judge.node';
import { synthesizerNode } from './nodes/synthesizer.node';

export function createExamAuditGraph() {
  const workflow = new StateGraph(ExamAuditState)
    // 1. Thêm các Nodes của Đội ngũ AI Squad
    .addNode('architect_ingest', architectIngestNode)
    .addNode('student_simulator', studentSimulatorNode)
    .addNode('rubric_judge', rubricJudgeNode)
    .addNode('architect_refiner', architectRefinerNode)
    .addNode('synthesizer', synthesizerNode)

    // 2. Định nghĩa các cạnh nối luồng (Edges)
    .addEdge(START, 'architect_ingest')
    .addEdge('architect_ingest', 'student_simulator')
    .addEdge('student_simulator', 'rubric_judge')

    // 3. Cạnh rẽ nhánh có điều kiện (Conditional Routing) do Rubric Judge quyết định
    .addConditionalEdges('rubric_judge', shouldContinueAudit, {
      architect_refiner: 'architect_refiner',
      synthesizer: 'synthesizer',
    })

    // 4. Vòng lặp phản biện (Feedback Loop): Sau khi tinh chỉnh câu hỏi thì quay lại sinh viên giải thử
    .addEdge('architect_refiner', 'student_simulator')

    // 5. Kết thúc sau khi tổng hợp báo cáo
    .addEdge('synthesizer', END);

  return workflow.compile();
}

export type ExamAuditGraphRunnable = ReturnType<typeof createExamAuditGraph>;
