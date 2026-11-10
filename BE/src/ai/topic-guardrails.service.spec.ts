import { TopicGuardrailsService } from './topic-guardrails.service';

describe('TopicGuardrailsService', () => {
  let service: TopicGuardrailsService;

  beforeEach(() => {
    service = new TopicGuardrailsService();
  });

  describe('isItOrCsCourse', () => {
    it('detects IT course by name or code', () => {
      expect(service.isItOrCsCourse('Nhập môn CNTT', 'IT101')).toBe(true);
      expect(service.isItOrCsCourse('Lập trình Hướng đối tượng', 'OOP202')).toBe(true);
      expect(service.isItOrCsCourse('Mạng máy tính', 'NET301')).toBe(true);
      expect(service.isItOrCsCourse('Phân tích trực quan kết quả bài thi 2026', 'ANALYTICS-2026')).toBe(true);
    });
  });

  describe('validateTopicScope', () => {
    it('allows valid technical prompts in IT courses', () => {
      const result = service.validateTopicScope({
        prompt: 'Tạo câu hỏi về tính đóng gói trong lập trình hướng đối tượng OOP',
        courseName: 'Nhập môn CNTT',
        courseCode: 'IT101',
      });
      expect(result.allowed).toBe(true);
      expect(result.offendingKeywords).toHaveLength(0);
    });

    it('blocks off-topic food prompt in IT course and highlights offending keywords', () => {
      const result = service.validateTopicScope({
        prompt: 'tạo giùm tôi 1 câu liên quan tới đồ ăn',
        courseName: 'Nhập môn CNTT',
        courseCode: 'IT101',
      });
      expect(result.allowed).toBe(false);
      expect(result.offendingKeywords).toContain('đồ ăn');
      expect(result.detectedDomain).toContain('Ẩm thực / Dinh dưỡng');
      expect(result.courseDomain).toContain('Nhập môn CNTT');
      expect(result.reason).toBeDefined();
    });

    it('blocks nutrition and food group questions in IT course', () => {
      const result = service.validateTopicScope({
        prompt: 'Trong các nhóm thực phẩm cơ bản sau đây, nhóm nào cung cấp nguồn năng lượng chính và thiết yếu nhất cho hoạt động của não bộ con người?: đạm, bột đường, chất béo, vitamin',
        courseName: 'Nhập môn CNTT',
        courseCode: 'IT101',
      });
      expect(result.allowed).toBe(false);
      expect(result.offendingKeywords.length).toBeGreaterThan(0);
      expect(result.offendingKeywords.some((k) => ['thực phẩm', 'chất đạm', 'bột đường', 'chất béo', 'vitamin'].includes(k))).toBe(true);
    });

    it('allows contextual technical exceptions (e.g. Python class modeling a restaurant menu)', () => {
      const result = service.validateTopicScope({
        prompt: 'Tạo bài tập lập trình Python viết class Quản lý Menu Đồ ăn và tính toán hóa đơn bằng hàm def',
        courseName: 'Nhập môn CNTT',
        courseCode: 'IT101',
      });
      expect(result.allowed).toBe(true);
    });

    it('blocks astrology and horoscope prompts in IT course', () => {
      const result = service.validateTopicScope({
        prompt: 'Hãy tạo câu hỏi về 12 cung hoàng đạo và tử vi vận mệnh năm nay',
        courseName: 'Lập trình Web',
        courseCode: 'WEB101',
      });
      expect(result.allowed).toBe(false);
      expect(result.offendingKeywords.some((k) => ['tử vi', 'cung hoàng đạo'].includes(k))).toBe(true);
    });
  });
});
