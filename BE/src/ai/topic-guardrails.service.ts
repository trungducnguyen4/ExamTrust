import { Injectable, Logger } from '@nestjs/common';

export interface GuardrailValidationResult {
  allowed: boolean;
  offendingKeywords: string[];
  detectedDomain?: string;
  courseDomain?: string;
  reason?: string;
  suggestion?: string;
}

export interface IncompatibleDomainRule {
  domainKey: string;
  domainNameVi: string;
  keywords: string[];
}

@Injectable()
export class TopicGuardrailsService {
  private readonly logger = new Logger(TopicGuardrailsService.name);

  // Technical keywords that indicate a programming/software engineering problem context
  private readonly technicalContextKeywords = [
    'python', 'java', 'c++', 'c#', 'javascript', 'typescript', 'sql', 'php', 'rust', 'golang',
    'lập trình', 'lap trinh', 'viết code', 'viet code', 'thuật toán', 'thuat toan',
    'class', 'lớp', 'object', 'đối tượng', 'function', 'hàm', 'method', 'phương thức',
    'cơ sở dữ liệu', 'co so du lieu', 'database', 'bảng', 'table', 'truy vấn', 'query',
    'mô hình hóa', 'mo hinh hoa', 'kiến trúc phần mềm', 'diagram', 'erd', 'uml',
    'api', 'rest', 'json', 'server', 'client', 'mạng máy tính', 'hệ điều hành',
    'cấu trúc dữ liệu', 'data structure', 'algorithm', 'biến', 'hằng', 'mảng', 'array',
  ];

  // Domains that are strictly out-of-scope for IT / Computer Science courses when not framed as a coding problem
  private readonly itIncompatibleDomains: IncompatibleDomainRule[] = [
    {
      domainKey: 'food_nutrition',
      domainNameVi: 'Ẩm thực / Dinh dưỡng / Thực phẩm',
      keywords: [
        'đồ ăn', 'do an', 'thức ăn', 'thuc an', 'món ăn', 'mon an', 'thực phẩm', 'thuc pham',
        'nấu ăn', 'nau an', 'chất đạm', 'chat dam', 'bột đường', 'bot duong', 'chất béo', 'chat beo',
        'vitamin', 'khoáng chất', 'khoang chat', 'dinh dưỡng', 'dinh duong', 'calo', 'calorie',
        'ẩm thực', 'am thuc', 'công thức nấu', 'cong thuc nau', 'bữa ăn', 'bua an', 'gia vị', 'gia vi',
        'food', 'recipe', 'cooking', 'nutrition', 'culinary',
      ],
    },
    {
      domainKey: 'beauty_cosmetics',
      domainNameVi: 'Mỹ phẩm / Làm đẹp / Thời trang',
      keywords: [
        'mỹ phẩm', 'my pham', 'son môi', 'son moi', 'trang điểm', 'trang diem', 'dưỡng da', 'duong da',
        'kem chống nắng', 'kem chong nang', 'nước hoa', 'nuoc hoa', 'thời trang may mặc',
        'cosmetics', 'skincare', 'makeup', 'lipstick',
      ],
    },
    {
      domainKey: 'astrology_divination',
      domainNameVi: 'Chiêm tinh / Tử vi / Bói toán',
      keywords: [
        'tử vi', 'tu vi', 'cung hoàng đạo', 'cung hoang dao', 'bói toán', 'boi toan',
        'bói bài', 'boi bai', 'phong thủy vận mệnh', 'tarot', 'horoscope', 'zodiac', 'astrology',
      ],
    },
    {
      domainKey: 'gossip_showbiz',
      domainNameVi: 'Showbiz / Scandal / Giật gân',
      keywords: [
        'scandal', 'hóng biến', 'hong bien', 'showbiz drama', 'bóc phốt', 'boc phot',
      ],
    },
  ];

  /**
   * Determine whether a course belongs to Information Technology / Computer Science
   */
  isItOrCsCourse(courseName?: string, courseCode?: string, faculty?: string, topic?: string): boolean {
    const combined = `${courseName || ''} ${courseCode || ''} ${faculty || ''} ${topic || ''}`.toLowerCase();
    const itKeywords = [
      'cntt', 'tin học', 'tin hoc', 'máy tính', 'may tinh', 'lập trình', 'lap trinh',
      'phần mềm', 'phan mem', 'phần cứng', 'phan cung', 'mạng', 'mang', 'an toàn thông tin',
      'khoa học máy tính', 'khoa hoc may tinh', 'hệ thống thông tin', 'csdl', 'database',
      'công nghệ thông tin', 'cong nghe thong tin', 'analytics', 'it', 'computer', 'software',
      'hardware', 'network', 'cyber', 'web', 'algorithm', 'intelligence', 'ai',
    ];
    return itKeywords.some((kw) => combined.includes(kw));
  }

  private normalizeText(text: string): string {
    return String(text || '').toLowerCase().trim();
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private findMatchedKeywords(text: string, candidateKeywords: string[]): string[] {
    const matched = new Set<string>();
    const normalized = this.normalizeText(text);

    for (const kw of candidateKeywords) {
      const kwNormalized = kw.toLowerCase();
      const escaped = this.escapeRegex(kwNormalized);
      // Ensure matching by word boundaries or distinct phrases
      const regex = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'u');
      if (regex.test(normalized)) {
        matched.add(kw);
      }
    }
    return Array.from(matched);
  }

  /**
   * Validate whether the user prompt stays within the academic scope of the course.
   */
  validateTopicScope(params: {
    prompt: string;
    courseName?: string;
    courseCode?: string;
    courseDescription?: string;
    topicName?: string;
    faculty?: string;
  }): GuardrailValidationResult {
    const { prompt, courseName, courseCode, topicName, faculty } = params;
    const cleanPrompt = String(prompt || '').trim();

    if (!cleanPrompt) {
      return { allowed: true, offendingKeywords: [] };
    }

    const isItCourse = this.isItOrCsCourse(courseName, courseCode, faculty, topicName);
    const effectiveCourseDomain = isItCourse
      ? (courseName ? `Công nghệ Thông tin (${courseName})` : 'Công nghệ Thông tin / Khoa học Máy tính')
      : (courseName || 'Học phần chuyên môn');

    if (isItCourse) {
      // Check if prompt has clear technical/programming context (Contextual Exception)
      const matchedTechnical = this.findMatchedKeywords(cleanPrompt, this.technicalContextKeywords);
      const hasStrongTechnicalContext = matchedTechnical.length >= 2 || (
        matchedTechnical.length >= 1 && /(?:viết|viet|tạo|tao|xây dựng|xay dung|thiết kế|thiet ke|mô hình|mo hinh|quản lý|quan ly|quản trị|quan tri)\s+(?:class|hàm|function|database|bảng|api|ứng dụng|app|hệ thống)/i.test(cleanPrompt)
      );

      // Check each incompatible domain
      for (const domain of this.itIncompatibleDomains) {
        const offending = this.findMatchedKeywords(cleanPrompt, domain.keywords);

        if (offending.length > 0) {
          // If the prompt is purely asking about the incompatible subject (without strong programming framing)
          if (!hasStrongTechnicalContext) {
            this.logger.warn(
              `[TopicGuardrail] Blocked off-topic prompt in IT course "${courseName || courseCode}": offending=[${offending.join(', ')}], domain="${domain.domainNameVi}"`
            );

            return {
              allowed: false,
              offendingKeywords: offending,
              detectedDomain: domain.domainNameVi,
              courseDomain: effectiveCourseDomain,
              reason: `Yêu cầu chứa các từ khóa thuộc chủ đề "${domain.domainNameVi}" không phù hợp với phạm vi học phần "${effectiveCourseDomain}".`,
              suggestion: `Vui lòng nhập nội dung liên quan trực tiếp đến kiến thức học phần ${courseName ? `(${courseName})` : 'CNTT'}, hoặc bổ sung ngữ cảnh kỹ thuật/lập trình rõ ràng nếu đây là bài toán mô phỏng.`,
            };
          }
        }
      }
    }

    return {
      allowed: true,
      offendingKeywords: [],
      courseDomain: effectiveCourseDomain,
    };
  }
}
