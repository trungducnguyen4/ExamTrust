import { BadRequestException } from '@nestjs/common';
import {
  assertQuestionPresenceAndOptions,
  assertQuestionContentLength,
  assertOptionsLength,
} from './question-validation';

describe('Question Validation - Tool & Service Logic Lock', () => {
  describe('assertQuestionPresenceAndOptions', () => {
    it('throws BadRequestException when question content is empty or only whitespace', () => {
      expect(() => assertQuestionPresenceAndOptions('MULTIPLE_CHOICE', '', { A: 'Option 1', B: 'Option 2' })).toThrow(
        BadRequestException,
      );
      expect(() => assertQuestionPresenceAndOptions('ESSAY', '   ', null)).toThrow(BadRequestException);
    });

    it('throws BadRequestException for MULTIPLE_CHOICE when options are missing or fewer than 2', () => {
      expect(() => assertQuestionPresenceAndOptions('MULTIPLE_CHOICE', 'What is RAM?', null)).toThrow(
        BadRequestException,
      );
      expect(() => assertQuestionPresenceAndOptions('MULTIPLE_CHOICE', 'What is RAM?', { A: 'Only one option' })).toThrow(
        BadRequestException,
      );
      expect(() =>
        assertQuestionPresenceAndOptions('MULTIPLE_CHOICE', 'What is RAM?', [
          { text: 'Option A' },
          { text: '  ' }, // empty second option
        ]),
      ).toThrow(BadRequestException);
    });

    it('passes for valid MULTIPLE_CHOICE with 2 or more non-empty options', () => {
      expect(() =>
        assertQuestionPresenceAndOptions('MULTIPLE_CHOICE', 'What is CPU?', {
          A: 'Central Processing Unit',
          B: 'Computer Personal Unit',
        }),
      ).not.toThrow();

      expect(() =>
        assertQuestionPresenceAndOptions('MULTIPLE_CHOICE', 'What is CPU?', [
          { text: 'Central Processing Unit' },
          { text: 'Control Processing Unit' },
        ]),
      ).not.toThrow();
    });

    it('passes for non-choice question types without options', () => {
      expect(() => assertQuestionPresenceAndOptions('ESSAY', 'Explain normalization in DBMS.', null)).not.toThrow();
    });
  });

  describe('assertQuestionContentLength & assertOptionsLength', () => {
    it('throws when content exceeds maximum allowed length', () => {
      const longContent = 'A'.repeat(2001);
      expect(() => assertQuestionContentLength(longContent)).toThrow(BadRequestException);
    });

    it('throws when an option exceeds maximum length', () => {
      const longOption = 'B'.repeat(1001);
      expect(() => assertOptionsLength({ A: longOption, B: 'Valid' })).toThrow(BadRequestException);
    });
  });
});
