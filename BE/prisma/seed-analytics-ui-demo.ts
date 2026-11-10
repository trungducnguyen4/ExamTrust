/**
 * Seed riêng cho màn hình UI Phân tích (lecturer/analytics).
 *
 * Tạo một bài thi mẫu "Bài thi trực quan cho trang analytics ở năm học 2026"
 * nằm trong một khoá học có academicYear = 2026, kèm 36 lượt làm bài thật
 * (tái sử dụng 36 tài khoản sinh viên 522hXXXX đã có sẵn), để phần
 * "Tín hiệu toàn vẹn" hiển thị DATA THẬT (không phải trạng thái trống):
 *   - 2 bài "Làm bài nhanh bất thường" (1 rủi ro cao HIGH, 1 cần xem xét REVIEW)
 *   - 1 cặp bài "Mẫu trả lời giống nhau bất thường" (đáp án sai hiếm trùng nhau)
 * Đồng thời phần "Bài tập ưu tiên" có dữ liệu thật (tỷ lệ sai cao, câu nghi ngờ
 * sai đáp án, mẫu trả lời phổ biến) và phủ đủ 9 loại câu hỏi để kiểm tra lỗi UI.
 *
 * Vì sao cần >= 10 câu hỏi 1-đáp-án (single-letter):
 *  - buildSimilarAnswerPairs yêu cầu "common.length >= 10" (số câu so sánh dùng
 *    chung giữa 1 cặp), và chỉ tính các câu trả lời rút gọn được thành 1 chữ cái
 *    (MULTIPLE_CHOICE / TRUE_FALSE / FIND_ERROR). Nên đề gồm 16 câu trong đó đủ
 *    10 câu single-letter để cặp nghi vấn lọt qua ngưỡng.
 *
 * Cách chạy:
 *   cd BE && npx ts-node --transpile-only prisma/seed-analytics-ui-demo.ts
 *
 * Script idempotent (dùng upsert) nên chạy lại nhiều lần đều an toàn.
 */
import { PrismaClient, QuestionLifecycleStatus, CourseTerm } from '@prisma/client';

const prisma = new PrismaClient();

const COURSE_CODE = 'ANALYTICS-2026';
const EXAM_TITLE = 'Bài thi trực quan cho trang analytics ở năm học 2026';
const LECTURER_EMAIL = 'lecturer01@tdtutdtu.edu.vn';
const STUDENT_ID_PATTERN = (index: number) => `522h${String(index + 1).padStart(4, '0')}`;
const STUDENT_COUNT = 36;
const TOPIC_CODE = 'ANALYTICS-2026-QB';

// Thời lượng cho phép (phút). Dùng để tính tỉ lệ hoàn thành cho fast-completion.
const ALLOWED_MINUTES = 90;

// Hồ sơ (profile) của từng sinh viên theo index i (0..35):
//   - FAST: 1 người rủi ro cao (HIGH) + 1 người cần xem xét (REVIEW)
//   - COLLUDE: cặp 2 người cùng chọn ĐÁP ÁN SAI HIẾM trên 4 câu -> cặp trùng mẫu
//   - còn lại NORMAL
const FAST_HIGH_INDEX = 30; // 8 phút, điểm 9.8 -> ratio ~0.09, scorePct 98 -> HIGH
const FAST_REVIEW_INDEX = 31; // 20 phút, điểm 9.4 -> ratio ~0.22, scorePct 94 -> REVIEW
const COLLUDE_INDICES = new Set([34, 35]);

const isFast = (i: number) => i === FAST_HIGH_INDEX || i === FAST_REVIEW_INDEX;
const isColluder = (i: number) => COLLUDE_INDICES.has(i);

// Câu hỏi dùng cho cặp nghi vấn (chỉ mình cặp COLLUDE chọn D → D hiếm).
// Đây là các chỉ số (index) trong mảng QUESTION_SPECS.
const COLLUSION_QUESTION_INDICES = new Set([10, 11, 12, 13]);

type QuestionSpec = {
  type: string;
  content: string;
  options: unknown;
  answerKey: unknown;
  explanation: string;
  difficulty: number;
  points: number;
  // generate(i) trả về câu trả lời (Json) + correct hay không cho sinh viên i.
  generate: (i: number) => { answer: unknown; correct: boolean };
};

const QUESTION_SPECS: QuestionSpec[] = [
  // 1) MULTIPLE_CHOICE — cố tình "sai đáp án" (key = A, gần như ai cũng chọn C)
  //      -> red card "Nghi ngờ sai đáp án", incorrectRate ~ 94%.
  {
    type: 'MULTIPLE_CHOICE',
    content:
      '[ANALYTICS-2026] Which clause is incorrect for filtering aggregate results?',
    options: {
      A: 'HAVING filters aggregated rows after GROUP BY',
      B: 'WHERE filters rows before aggregation',
      C: 'ORDER BY filters aggregate results',
      D: 'WHERE cannot reference aggregate functions directly',
    },
    answerKey: { answer: 'A' },
    explanation:
      'ORDER BY only sorts results; it never filters. HAVING is the correct way to filter aggregated rows.',
    difficulty: 7,
    points: 1,
    generate: (i) =>
      isFast(i)
        ? { answer: { answer: 'A' }, correct: true }
        : { answer: { answer: 'C' }, correct: false },
  },
  // 2) MULTI_SELECT (không phải single-letter)
  {
    type: 'MULTI_SELECT',
    content: '[ANALYTICS-2026] Select all clauses that can appear in a GROUP BY query.',
    options: {
      A: 'HAVING',
      B: 'GROUP BY',
      C: 'WHERE on non-aggregate columns',
      D: 'ORDER BY',
    },
    answerKey: { answer: ['A', 'C'] },
    explanation: 'HAVING filters groups, WHERE filters raw rows before grouping.',
    difficulty: 4,
    points: 1,
    generate: (i) =>
      isFast(i) || i < 10
        ? { answer: { answer: ['A', 'C'] }, correct: true }
        : { answer: { answer: ['A', 'B'] }, correct: false },
  },
  // 3) TRUE_FALSE — key = A (Đúng), phần lớn chọn sai B => red card True/False
  {
    type: 'TRUE_FALSE',
    content: '[ANALYTICS-2026] HAVING can be used without GROUP BY in some RDBMS.',
    options: { A: 'Đúng', B: 'Sai' },
    answerKey: { answer: 'A' },
    explanation: 'Một số DBMS cho phép HAVING không cần GROUP BY.',
    difficulty: 3,
    points: 1,
    generate: (i) =>
      isFast(i) || i % 3 === 0
        ? { answer: { answer: 'A' }, correct: true }
        : { answer: { answer: 'B' }, correct: false },
  },
  // 4) SHORT_ANSWER — hiện blue box "Mẫu trả lời phổ biến" (TEXT)
  {
    type: 'SHORT_ANSWER',
    content:
      '[ANALYTICS-2026] Explain when a B-tree index improves performance and when it may not.',
    options: null,
    answerKey: {
      answer: 'Range and equality lookups on indexed columns; not effective on leading-wildcard or low-cardinality columns.',
    },
    explanation:
      'B-tree giúp ích cho truy vấn phạm vi/bằng trên cột đã index; kém hiệu quả với wildcard đầu chuỗi hoặc cột ít giá trị phân biệt.',
    difficulty: 5,
    points: 1,
    generate: (i) =>
      isFast(i) || i < 10
        ? { answer: { answer: 'Range and equality lookups on the indexed column' }, correct: true }
        : { answer: { answer: 'B-tree always improves all queries' }, correct: false },
  },
  // 5) ESSAY — hiện blue box "Mẫu trả lời phổ biến" (TEXT)
  {
    type: 'ESSAY',
    content: '[ANALYTICS-2026] Discuss the trade-offs of normalizing a database schema.',
    options: null,
    answerKey: {
      answer:
        'Reduces redundancy and update anomalies but may increase join cost; balance 3NF with query performance denormalization.',
    },
    explanation: 'Chuẩn hoá giảm trùng lặp song có thể tăng chi phí join.',
    difficulty: 6,
    points: 1,
    generate: (i) =>
      isFast(i) || i < 8
        ? { answer: { answer: 'Reduce redundancy and update anomalies, at the cost of more joins' }, correct: true }
        : { answer: { answer: 'More tables are always better' }, correct: false },
  },
  // 6) FILL_IN_BLANK — hiện blue box "Ô trống ..." (FILL_IN_BLANK)
  {
    type: 'FILL_IN_BLANK',
    content: '[ANALYTICS-2026] Complete: The ___ clause filters aggregated rows.',
    options: null,
    answerKey: { answer: ['HAVING'] },
    explanation: 'HAVING là mệnh đề lọc dữ liệu đã gộp nhóm.',
    difficulty: 4,
    points: 1,
    generate: (i) =>
      isFast(i) || i < 6
        ? { answer: ['HAVING'], correct: true }
        : { answer: ['SELECT'], correct: false },
  },
  // 7) MATCHING — hiện blue box "Cách ghép phổ biến" (MATCHING)
  {
    type: 'MATCHING',
    content: '[ANALYTICS-2026] Match SQL operators with their purpose.',
    options: {
      left: ['=', 'BETWEEN', 'LIKE', 'IN'],
      right: ['Equality comparison', 'Range inclusive', 'Pattern matching', 'List membership'],
    },
    answerKey: {
      pairs: [
        { left: '=', right: 'Equality comparison' },
        { left: 'BETWEEN', right: 'Range inclusive' },
        { left: 'LIKE', right: 'Pattern matching' },
        { left: 'IN', right: 'List membership' },
      ],
    },
    explanation: 'Mỗi toán tử SQL có một mục đích riêng.',
    difficulty: 5,
    points: 1,
    generate: (i) =>
      isFast(i) || i < 4
        ? {
            answer: { 0: 'Equality comparison', 1: 'Range inclusive', 2: 'Pattern matching', 3: 'List membership' },
            correct: true,
          }
        : {
            answer: { 0: 'Pattern matching', 1: 'List membership', 2: 'Equality comparison', 3: 'Range inclusive' },
            correct: false,
          },
  },
  // 8) ORDERING — hiện blue box "Thứ tự phổ biến" (ORDERING)
  {
    type: 'ORDERING',
    content: '[ANALYTICS-2026] Order the steps of a SELECT query logically.',
    options: { items: ['FROM', 'WHERE', 'GROUP BY', 'HAVING', 'SELECT', 'ORDER BY'] },
    answerKey: { items: ['FROM', 'WHERE', 'GROUP BY', 'HAVING', 'SELECT', 'ORDER BY'] },
    explanation: 'Thứ tự logic chuẩn của câu lệnh SELECT.',
    difficulty: 6,
    points: 1,
    generate: (i) =>
      isFast(i) || i < 4
        ? { answer: ['FROM', 'WHERE', 'GROUP BY', 'HAVING', 'SELECT', 'ORDER BY'], correct: true }
        : { answer: ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY'], correct: false },
  },
  // 9) FIND_ERROR — key = A (single-letter), đáp án sai dàn đều B/C/D (không red card)
  {
    type: 'FIND_ERROR',
    content: '[ANALYTICS-2026] Find the line that has an error in this SQL statement.',
    options: {
      A: 'SELECT dept_id, COUNT(*)',
      B: 'FROM employees',
      C: 'WHERE salary > 0',
      D: 'GROUP BY dept_id;',
    },
    answerKey: { answer: 'A' },
    explanation: 'Dòng A thiếu cột đầy đủ cho mệnh đề SELECT hợp lệ trong ngữ cảnh này.',
    difficulty: 4,
    points: 1,
    generate: (i) => {
      if (isFast(i) || i % 4 === 0) return { answer: { answer: 'A' }, correct: true };
      return { answer: { answer: ['B', 'C', 'D'][i % 3] }, correct: false };
    },
  },
  // 10) MULTIPLE_CHOICE — COLLUSION (key A; chỉ cặp COLLUDE chọn D -> D hiếm)
  {
    type: 'MULTIPLE_CHOICE',
    content: '[ANALYTICS-2026] Which operator tests for pattern matching in SQL?',
    options: { A: 'LIKE', B: '=', C: 'BETWEEN', D: 'IN' },
    answerKey: { answer: 'A' },
    explanation: 'LIKE dùng để so khớp mẫu (pattern matching).',
    difficulty: 3,
    points: 1,
    generate: (i) => {
      if (isFast(i)) return { answer: { answer: 'A' }, correct: true };
      if (isColluder(i)) return { answer: { answer: 'D' }, correct: false };
      return { answer: { answer: 'A' }, correct: true }; // đa số đúng -> không tràn vào bài tập ưu tiên
    },
  },
  // 11) MULTIPLE_CHOICE — COLLUSION (key B; chỉ cặp COLLUDE chọn D)
  {
    type: 'MULTIPLE_CHOICE',
    content: '[ANALYTICS-2026] Which clause removes duplicate rows from a result?',
    options: { A: 'ORDER BY', B: 'DISTINCT', C: 'GROUP BY', D: 'LIMIT' },
    answerKey: { answer: 'B' },
    explanation: 'SELECT DISTINCT loại bỏ các dòng trùng lặp.',
    difficulty: 3,
    points: 1,
    generate: (i) => {
      if (isFast(i)) return { answer: { answer: 'B' }, correct: true };
      if (isColluder(i)) return { answer: { answer: 'D' }, correct: false };
      return { answer: { answer: 'B' }, correct: true }; // đa số đúng
    },
  },
  // 12) MULTIPLE_CHOICE — COLLUSION (key C; chỉ cặp COLLUDE chọn D)
  {
    type: 'MULTIPLE_CHOICE',
    content: '[ANALYTICS-2026] Which function returns the number of rows in a group?',
    options: { A: 'SUM', B: 'AVG', C: 'COUNT', D: 'MIN' },
    answerKey: { answer: 'C' },
    explanation: 'COUNT đếm số dòng / giá trị trong nhóm.',
    difficulty: 2,
    points: 1,
    generate: (i) => {
      if (isFast(i)) return { answer: { answer: 'C' }, correct: true };
      if (isColluder(i)) return { answer: { answer: 'D' }, correct: false };
      return { answer: { answer: 'C' }, correct: true }; // đa số đúng
    },
  },
  // 13) MULTIPLE_CHOICE — COLLUSION (key A; chỉ cặp COLLUDE chọn D)
  {
    type: 'MULTIPLE_CHOICE',
    content: '[ANALYTICS-2026] Which keyword is optional before the table name in a DELETE?',
    options: { A: 'FROM', B: 'WHERE', C: 'SET', D: 'VALUES' },
    answerKey: { answer: 'A' },
    explanation: 'FROM thường đi sau DELETE để chỉ bảng.',
    difficulty: 3,
    points: 1,
    generate: (i) => {
      if (isFast(i)) return { answer: { answer: 'A' }, correct: true };
      if (isColluder(i)) return { answer: { answer: 'D' }, correct: false };
      return { answer: { answer: 'A' }, correct: true }; // đa số đúng
    },
  },
  // 14) MULTIPLE_CHOICE — single-letter bổ sung (không collusion)
  {
    type: 'MULTIPLE_CHOICE',
    content: '[ANALYTICS-2026] Which join returns only matching rows from both tables?',
    options: { A: 'LEFT JOIN', B: 'INNER JOIN', C: 'FULL JOIN', D: 'CROSS JOIN' },
    answerKey: { answer: 'B' },
    explanation: 'INNER JOIN chỉ trả về các dòng khớp ở cả hai bảng.',
    difficulty: 3,
    points: 1,
    generate: (i) =>
      isFast(i) || i % 7 !== 0
        ? { answer: { answer: 'B' }, correct: true }
        : { answer: { answer: 'A' }, correct: false },
  },
  // 15) TRUE_FALSE — single-letter bổ sung (key A)
  {
    type: 'TRUE_FALSE',
    content: '[ANALYTICS-2026] An index speeds up writes as well as reads.',
    options: { A: 'Đúng', B: 'Sai' },
    answerKey: { answer: 'B' }, // Sai là đáp án đúng
    explanation: 'Index thường làm chậm thao tác ghi (INSERT/UPDATE/DELETE).',
    difficulty: 3,
    points: 1,
    generate: (i) =>
      isFast(i) || i % 7 !== 0
        ? { answer: { answer: 'B' }, correct: true }
        : { answer: { answer: 'A' }, correct: false },
  },
  // 16) FIND_ERROR — single-letter bổ sung (key A)
  {
    type: 'FIND_ERROR',
    content: '[ANALYTICS-2026] Find the line with a syntax error in this statement.',
    options: {
      A: 'SELECT * FROM users',
      B: 'ORDER BY name;',
      C: 'WHERE id = 1',
      D: 'GROUP BY department HAVING COUNT(*) > 1',
    },
    answerKey: { answer: 'C' }, // WHERE phải đứng trước ORDER BY
    explanation: 'Thứ tự mệnh đề sai: WHERE phải đặt trước ORDER BY.',
    difficulty: 4,
    points: 1,
    generate: (i) =>
      isFast(i) || i % 7 !== 0
        ? { answer: { answer: 'C' }, correct: true }
        : { answer: { answer: 'A' }, correct: false },
  },
];

// Danh sách 16 câu thuộc loại 1-đáp-án (single-letter) — dùng để tính "common"
// cho cặp nghi vấn (cần >= 10).
const SINGLE_LETTER_ANSWER_COUNT = QUESTION_SPECS.filter((q) =>
  ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'FIND_ERROR'].includes(q.type),
).length;

export async function main() {
  const lecturer = await prisma.user.findUnique({ where: { email: LECTURER_EMAIL } });
  if (!lecturer) {
    throw new Error(`Không tìm thấy giảng viên ${LECTURER_EMAIL}; hãy chạy seed accounts trước.`);
  }

  if (SINGLE_LETTER_ANSWER_COUNT < 10) {
    throw new Error(`Cần ít nhất 10 câu 1-đáp-án để tạo cặp "similar answer" (hiện có ${SINGLE_LETTER_ANSWER_COUNT}).`);
  }

  // 1) Khoá học năm học 2026, học kỳ 1.
  const course = await prisma.course.upsert({
    where: { code: COURSE_CODE },
    update: {
      name: 'Phân tích trực quan kết quả bài thi 2026',
      description: 'Khoá học mẫu để minh hoạ trang UI Phân tích (lecturer/analytics) năm học 2026.',
      academicYear: '2026',
      term: CourseTerm.TERM_1,
      lecturerId: lecturer.id,
      status: 'active',
      credits: 3,
    },
    create: {
      code: COURSE_CODE,
      name: 'Phân tích trực quan kết quả bài thi 2026',
      description: 'Khoá học mẫu để minh hoạ trang UI Phân tích (lecturer/analytics) năm học 2026.',
      academicYear: '2026',
      term: CourseTerm.TERM_1,
      lecturerId: lecturer.id,
      status: 'active',
      credits: 3,
    },
  });

  // 2) Topic cho bộ ngân hàng câu hỏi demo.
  const topic = await prisma.topic.upsert({
    where: { courseId_code: { courseId: course.id, code: TOPIC_CODE } },
    update: { name: 'SQL Advanced Queries & Analytics' },
    create: { courseId: course.id, code: TOPIC_CODE, name: 'SQL Advanced Queries & Analytics' },
  });
  await prisma.courseTopic.upsert({
    where: { courseId_topicId: { courseId: course.id, topicId: topic.id } },
    update: {},
    create: { courseId: course.id, topicId: topic.id },
  });

  // 3) Tạo 16 câu hỏi + version + course scope + topic.
  const createdQuestions: Array<{ questionId: string; versionId: string; type: string }> = [];
  for (const spec of QUESTION_SPECS) {
    const existingQ = await prisma.question.findFirst({
      where: { courseId: course.id, content: spec.content },
      select: { id: true },
    });
    const question = existingQ ?? (await prisma.question.create({
      data: {
        type: spec.type,
        content: spec.content,
        options: spec.options ?? undefined,
        correctAnswer: spec.answerKey,
        explanation: spec.explanation,
        difficulty: spec.difficulty,
        points: spec.points,
        defaultPoints: spec.points,
        courseId: course.id,
        creatorId: lecturer.id,
        status: QuestionLifecycleStatus.PUBLISHED,
        latestVersionNo: 1,
        isReusable: true,
      },
    }));
    const version = await prisma.questionVersion.upsert({
      where: { questionId_versionNo: { questionId: question.id, versionNo: 1 } },
      update: {
        stem: spec.content,
        payload: spec.options ?? undefined,
        answerKey: spec.answerKey,
        explanation: spec.explanation,
        difficulty: spec.difficulty,
        points: spec.points,
      },
      create: {
        questionId: question.id,
        versionNo: 1,
        stem: spec.content,
        payload: spec.options ?? undefined,
        answerKey: spec.answerKey,
        explanation: spec.explanation,
        difficulty: spec.difficulty,
        points: spec.points,
        metadata: { seededQuestionType: spec.type, seededAnalyticsDemo: true },
        createdBy: lecturer.id,
      },
    });
    await prisma.questionCourseScope.upsert({
      where: { questionId_courseId: { questionId: question.id, courseId: course.id } },
      update: {},
      create: { questionId: question.id, courseId: course.id },
    });
    await prisma.questionTopic.upsert({
      where: { questionId_topicId: { questionId: question.id, topicId: topic.id } },
      update: { weight: 1 },
      create: { questionId: question.id, topicId: topic.id, weight: 1 },
    });
    createdQuestions.push({ questionId: question.id, versionId: version.id, type: spec.type });
  }

  // 4) Bài thi năm học 2026.
  const endTime = new Date('2026-08-10T14:00:00.000Z');
  const startTime = new Date('2026-08-10T12:00:00.000Z');

  let examRow = await prisma.exam.findFirst({
    where: { courseId: course.id, title: EXAM_TITLE, deletedAt: null },
  });
  if (!examRow) {
    examRow = await prisma.exam.create({
      data: {
        title: EXAM_TITLE,
        description:
          'Bài thi mẫu để hiển thị trực quan toàn bộ loại câu hỏi và tín hiệu toàn vẹn trên trang Phân tích năm học 2026.',
        courseId: course.id,
        creatorId: lecturer.id,
        duration: ALLOWED_MINUTES,
        timeLimitMinutes: ALLOWED_MINUTES,
        totalPoints: 100,
        passingScore: 50,
        maxAttempts: 1,
        status: 'COMPLETED',
        startTime,
        endTime,
        resultsPublishedAt: endTime,
        scoringScale: 10,
        gradingStrategy: 'HIGHEST',
        settings: { autoGrade: true, showResult: true },
        questionSelectionConfig: { mode: 'FIXED' },
      },
    });
  }

  // 5) Gắn 16 câu hỏi vào bài thi theo thứ tự.
  for (const [index, eq] of createdQuestions.entries()) {
    await prisma.examQuestion.upsert({
      where: { examId_questionId: { examId: examRow.id, questionId: eq.questionId } },
      update: { questionVersionId: eq.versionId, orderIndex: index, points: 1 },
      create: {
        examId: examRow.id,
        questionId: eq.questionId,
        questionVersionId: eq.versionId,
        orderIndex: index,
        points: 1,
      },
    });
  }

  // 6) 36 sinh viên: enroll + bài làm + câu trả lời.
  const students = await prisma.user.findMany({
    where: { role: 'STUDENT' },
    select: { id: true, email: true, fullName: true, studentId: true },
  });
  const studentsByCode = new Map<string, typeof students[number]>();
  for (const s of students) {
    if (s.studentId) studentsByCode.set(s.studentId, s);
  }

  const BASE = new Date('2026-08-10T02:00:00.000Z');
  let submissionCount = 0;

  for (let i = 0; i < STUDENT_COUNT; i += 1) {
    const studentCode = STUDENT_ID_PATTERN(i);
    const student = studentsByCode.get(studentCode);
    if (!student) {
      console.warn(`Bỏ qua sinh viên ${studentCode} (không tồn tại).`);
      continue;
    }

    await prisma.enrollment.upsert({
      where: { courseId_studentId: { courseId: course.id, studentId: student.id } },
      update: { status: 'active' },
      create: { courseId: course.id, studentId: student.id, status: 'active' },
    });

    // Xác định đáp án + điểm cho từng câu.
    let correctCount = 0;
    const perQuestion: Array<{ questionId: string; versionId: string; answer: unknown; correct: boolean }> = [];
    for (let q = 0; q < QUESTION_SPECS.length; q += 1) {
      const spec = QUESTION_SPECS[q];
      const { answer, correct } = spec.generate(i);
      if (correct) correctCount += 1;
      perQuestion.push({ questionId: createdQuestions[q].questionId, versionId: createdQuestions[q].versionId, answer, correct });
    }

    // Thời gian làm bài (phút) & điểm 10.0 theo từng hồ sơ.
    let elapsedMinutes: number;
    let score: number;
    if (i === FAST_HIGH_INDEX) {
      elapsedMinutes = 8; // ratio ~0.09 -> HIGH
      score = 9.8;
    } else if (i === FAST_REVIEW_INDEX) {
      elapsedMinutes = 20; // ratio ~0.22 -> REVIEW
      score = 9.4;
    } else if (isColluder(i)) {
      elapsedMinutes = 30 + ((i * 7) % 51);
      score = Math.min(8.5, correctCount); // thời gian bình thường nên không fast
    } else {
      elapsedMinutes = 30 + ((i * 7) % 51);
      score = Math.min(8.5, correctCount);
    }

    const startedAt = new Date(BASE.getTime() + i * 20 * 60_000);
    const submittedAt = new Date(startedAt.getTime() + elapsedMinutes * 60_000);

    const submission = await prisma.examSubmission.upsert({
      where: { examId_studentId_attemptNo: { examId: examRow.id, studentId: student.id, attemptNo: 1 } },
      update: {
        status: 'GRADED',
        score,
        startedAt,
        submittedAt,
        gradedAt: submittedAt,
        lastActivityAt: submittedAt,
      },
      create: {
        examId: examRow.id,
        studentId: student.id,
        attemptNo: 1,
        status: 'GRADED',
        score,
        startedAt,
        submittedAt,
        gradedAt: submittedAt,
        lastActivityAt: submittedAt,
      },
    });

    for (const q of perQuestion) {
      await prisma.submissionAnswer.upsert({
        where: { submissionId_questionId: { submissionId: submission.id, questionId: q.questionId } },
        update: {
          answer: q.answer as any,
          isCorrect: q.correct,
          questionVersionId: q.versionId,
          timeTaken: 25 + ((i + 7 * q.questionId.length) % 90),
          sequence: 1,
        },
        create: {
          submissionId: submission.id,
          questionId: q.questionId,
          questionVersionId: q.versionId,
          answer: q.answer as any,
          isCorrect: q.correct,
          timeTaken: 25 + ((i + 7 * q.questionId.length) % 90),
          sequence: 1,
        },
      });
    }

    submissionCount += 1;
  }

  // 7) Thống kê câu hỏi (tổng hợp) cho từng version.
  for (const q of createdQuestions) {
    const answers = await prisma.submissionAnswer.findMany({
      where: { questionId: q.questionId, submission: { examId: examRow.id } },
      select: { isCorrect: true },
    });
    const total = answers.length;
    const correctAttempts = answers.filter((a) => Boolean(a.isCorrect)).length;
    const incorrectAttempts = total - correctAttempts;
    await prisma.questionStatistics.upsert({
      where: { questionVersionId: q.versionId },
      update: {
        totalAttempts: total,
        correctAttempts,
        incorrectAttempts,
        skippedAttempts: 0,
        pValue: total ? correctAttempts / total : 0,
        difficultyIndex: total ? 1 - correctAttempts / total : 0,
        lastRecomputedAt: new Date(),
      },
      create: {
        questionVersionId: q.versionId,
        questionId: q.questionId,
        totalAttempts: total,
        correctAttempts,
        incorrectAttempts,
        skippedAttempts: 0,
        pValue: total ? correctAttempts / total : 0,
        difficultyIndex: total ? 1 - correctAttempts / total : 0,
        lastRecomputedAt: new Date(),
      },
    });
  }

  console.log('=== Seed UI Phân tích hoàn tất ===');
  console.log(`Khoá học: ${course.code} (${course.academicYear} - ${course.term})`);
  console.log(`Bài thi: ${examRow.title} (id: ${examRow.id})`);
  console.log(`Số bài làm: ${submissionCount}`);
  console.log(`Số câu 1-đáp-án (single-letter): ${SINGLE_LETTER_ANSWER_COUNT} (cần >= 10 cho cặp similar)`);
  console.log(`Toàn bộ loại câu hỏi trong đề (${createdQuestions.length}):`);
  for (const q of createdQuestions) {
    console.log(`  - ${q.type}`);
  }
  console.log(`Hồ sơ tín hiệu:`);
  console.log(`  - Làm bài nhanh: index ${FAST_HIGH_INDEX} (HIGH), index ${FAST_REVIEW_INDEX} (REVIEW)`);
  console.log(`  - Cặp trùng mẫu: index [${[...COLLUDE_INDICES].join(', ')}] trên các câu ${[...COLLUSION_QUESTION_INDICES].join(', ')}`);
}

if (process.argv.some((arg) => arg.includes('seed-analytics-ui-demo.ts'))) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}