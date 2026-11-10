import { BadRequestException } from '@nestjs/common';

export const QUESTION_LIMITS = {
  content: 2000,
  option: 1000,
  explanation: 4000,
  lineContent: {
    minLines: 2,
    maxLines: 50,
    maxCharsPerLine: 500,
    maxTotalLength: 10000,
  },
} as const;

/**
 * Validate question content length. Throws BadRequestException on violation.
 */
export function assertQuestionContentLength(content: unknown): void {
  const text = typeof content === 'string' ? content : '';
  if (text.length > QUESTION_LIMITS.content) {
    throw new BadRequestException(
      `Nội dung câu hỏi không được vượt quá ${QUESTION_LIMITS.content.toLocaleString()} ký tự.`,
    );
  }
}

/**
 * Validate explanation length.
 */
export function assertExplanationLength(explanation: unknown): void {
  const text = typeof explanation === 'string' ? explanation : '';
  if (text.length > QUESTION_LIMITS.explanation) {
    throw new BadRequestException(
      `Giải thích không được vượt quá ${QUESTION_LIMITS.explanation.toLocaleString()} ký tự.`,
    );
  }
}

/**
 * Validate option/answer text lengths in the options object.
 */
export function assertOptionsLength(options: unknown): void {
  if (!options || typeof options !== 'object') return;
  const entries = Array.isArray(options)
    ? options.map((v: any, i: number) => [String.fromCharCode(65 + i), String(v?.text ?? v ?? '')])
    : Object.entries(options as Record<string, unknown>);

  for (const [key, value] of entries) {
    const text = String(value ?? '');
    if (text.length > QUESTION_LIMITS.option) {
      throw new BadRequestException(
        `Đáp án "${key}" vượt quá ${QUESTION_LIMITS.option.toLocaleString()} ký tự. Mỗi đáp án tối đa ${QUESTION_LIMITS.option.toLocaleString()} ký tự.`,
      );
    }
  }
}

/**
 * Validate find_error / ordering line content from an options object.
 * Reports errors with real (1-indexed) line numbers.
 */
export function assertLineContent(options: unknown): void {
  if (!options || typeof options !== 'object') return;

  const rawLines: string[] = [];
  if (Array.isArray(options)) {
    rawLines.push(...options.map((v: any) => String(v?.text ?? v ?? '')));
  } else {
    const keys = Object.keys(options as Record<string, unknown>).sort();
    rawLines.push(...keys.map((k) => String((options as Record<string, unknown>)[k] ?? '')));
  }

  const nonEmpty: { index: number; text: string }[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line.trim().length > 0) {
      nonEmpty.push({ index: i + 1, text: line });
    }
  }

  if (nonEmpty.length < QUESTION_LIMITS.lineContent.minLines) {
    throw new BadRequestException(
      `Cần ít nhất ${QUESTION_LIMITS.lineContent.minLines} dòng không rỗng.`,
    );
  }

  if (nonEmpty.length > QUESTION_LIMITS.lineContent.maxLines) {
    throw new BadRequestException(
      `Nội dung theo dòng chỉ được chứa tối đa ${QUESTION_LIMITS.lineContent.maxLines} dòng không rỗng.`,
    );
  }

  for (const item of nonEmpty) {
    if (item.text.length > QUESTION_LIMITS.lineContent.maxCharsPerLine) {
      throw new BadRequestException(
        `Dòng ${item.index} có ${item.text.length} ký tự. Mỗi dòng tối đa ${QUESTION_LIMITS.lineContent.maxCharsPerLine} ký tự.`,
      );
    }
  }

  const total = rawLines.join('\n').length;
  if (total > QUESTION_LIMITS.lineContent.maxTotalLength) {
    throw new BadRequestException(
      `Nội dung theo dòng không được vượt quá ${QUESTION_LIMITS.lineContent.maxTotalLength.toLocaleString()} ký tự.`,
    );
  }
}

/**
 * Validate that question content is present, non-empty, and options are structurally sound.
 */
export function assertQuestionPresenceAndOptions(type: string, content: unknown, options: unknown): void {
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) {
    throw new BadRequestException('Nội dung câu hỏi không được để trống.');
  }

  const normalizedType = String(type || '').toUpperCase();
  if (normalizedType === 'MULTIPLE_CHOICE') {
    if (!options || typeof options !== 'object') {
      throw new BadRequestException('Câu hỏi trắc nghiệm phải có danh sách phương án lựa chọn.');
    }
    const optionEntries = Array.isArray(options)
      ? options.filter((v) => Boolean(String(v?.text ?? v ?? '').trim()))
      : Object.values(options).filter((v) => Boolean(String(v ?? '').trim()));

    if (optionEntries.length < 2) {
      throw new BadRequestException('Câu hỏi trắc nghiệm phải có ít nhất 2 phương án lựa chọn.');
    }
  }
}
