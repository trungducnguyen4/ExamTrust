import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormattedQuestionText } from './FormattedQuestionText';

describe('FormattedQuestionText', () => {
  it('renders bold formatting for question keywords and negative words', () => {
    render(<FormattedQuestionText text="Trong lập trình OOP, đặc tính nào **KHÔNG** phải là trụ cột chính?" />);
    const boldEl = screen.getByTestId('formatted-bold');
    expect(boldEl.tagName).toBe('STRONG');
    expect(boldEl.textContent).toBe('KHÔNG');
  });

  it('renders italic formatting for foreign loanwords and terms', () => {
    render(<FormattedQuestionText text="Khái niệm *encapsulation* trong lập trình có ý nghĩa gì?" />);
    const italicEl = screen.getByTestId('formatted-italic');
    expect(italicEl.tagName).toBe('EM');
    expect(italicEl.textContent).toBe('encapsulation');
  });

  it('renders underline placeholder for fill-in-the-blank questions', () => {
    render(<FormattedQuestionText text="Thủ đô của Việt Nam là _____." />);
    const blankEl = screen.getByTestId('formatted-blank');
    expect(blankEl.textContent).toContain('_____');
  });

  it('renders embedded double bracket answers when showInlineAnswers is enabled', () => {
    render(<FormattedQuestionText text="Thủ đô của Việt Nam là [[Hà Nội]]." showInlineAnswers={true} />);
    const answerEl = screen.getByTestId('formatted-blank-answer');
    expect(answerEl.textContent).toBe('[Hà Nội]');
  });

  it('renders mixed typography properly in complex exam prompt', () => {
    render(
      <FormattedQuestionText text="**Hãy chọn** phương án *đúng nhất*: Giao thức nào **KHÔNG** hoạt động ở tầng *Application*?" />
    );
    const bolds = screen.getAllByTestId('formatted-bold');
    expect(bolds).toHaveLength(2);
    expect(bolds[0].textContent).toBe('Hãy chọn');
    expect(bolds[1].textContent).toBe('KHÔNG');

    const italics = screen.getAllByTestId('formatted-italic');
    expect(italics).toHaveLength(2);
    expect(italics[0].textContent).toBe('đúng nhất');
    expect(italics[1].textContent).toBe('Application');
  });
});
