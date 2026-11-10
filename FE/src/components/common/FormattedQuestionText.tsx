import React, { useMemo } from 'react';

export interface FormattedQuestionTextProps {
  text?: string | null;
  className?: string;
  showInlineAnswers?: boolean;
}

type TextToken =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'blank'; value: string; answer?: string };

/**
 * Pedagogical Question Text Formatter:
 * Safely parses and renders Markdown typography in question stems & explanations:
 * - **bold** for key commands & negative words (KHÔNG, NGOẠI TRỪ)
 * - *italic* for foreign loanwords, code terms, and quotes
 * - _____ or [[answer]] for fill-in-the-blank placeholders
 * Zero external dependencies, pure XSS-safe React elements.
 */
export const FormattedQuestionText: React.FC<FormattedQuestionTextProps> = ({
  text,
  className = '',
  showInlineAnswers = false,
}) => {
  const tokens = useMemo<TextToken[]>(() => {
    if (!text) return [];

    const raw = String(text);
    const parsedTokens: TextToken[] = [];

    // Regex pattern matching:
    // 1. Double bracket blanks: [[answer]]
    // 2. Underline blanks: _____ (3 or more underscores)
    // 3. Bold: **text**
    // 4. Italic: *text*
    const tokenRegex = /(\[\[([^\]]+)\]\])|(_{3,})|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)/g;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = tokenRegex.exec(raw)) !== null) {
      // Push preceding plain text if any
      if (match.index > lastIndex) {
        parsedTokens.push({
          type: 'text',
          value: raw.slice(lastIndex, match.index),
        });
      }

      if (match[1]) {
        // [[answer]] blank
        parsedTokens.push({
          type: 'blank',
          value: '_____',
          answer: match[2]?.trim(),
        });
      } else if (match[3]) {
        // _____ blank
        parsedTokens.push({
          type: 'blank',
          value: match[3],
        });
      } else if (match[4]) {
        // **bold**
        parsedTokens.push({
          type: 'bold',
          value: match[5],
        });
      } else if (match[6]) {
        // *italic*
        parsedTokens.push({
          type: 'italic',
          value: match[7],
        });
      }

      lastIndex = tokenRegex.lastIndex;
    }

    // Push trailing plain text
    if (lastIndex < raw.length) {
      parsedTokens.push({
        type: 'text',
        value: raw.slice(lastIndex),
      });
    }

    return parsedTokens;
  }, [text]);

  if (!text) return null;

  return (
    <span className={`inline-block leading-relaxed ${className}`} data-testid="formatted-question-text">
      {tokens.map((token, index) => {
        if (token.type === 'bold') {
          // Highlight negative words with extra emphasis if needed
          const isNegativeCue = /^(KHÔNG|NGOẠI TRỪ|SAI|KHÔNG ĐÚNG|NOT|EXCEPT)$/i.test(token.value.trim());
          return (
            <strong
              key={index}
              data-testid="formatted-bold"
              className={`font-bold ${isNegativeCue ? 'text-foreground underline decoration-primary/50 underline-offset-2' : 'text-foreground'}`}
            >
              {token.value}
            </strong>
          );
        }

        if (token.type === 'italic') {
          return (
            <em key={index} data-testid="formatted-italic" className="italic font-serif text-muted-foreground/95">
              {token.value}
            </em>
          );
        }

        if (token.type === 'blank') {
          if (showInlineAnswers && token.answer) {
            return (
              <span
                key={index}
                data-testid="formatted-blank-answer"
                className="inline-block mx-1 px-2 py-0.5 rounded-t border-b-2 border-primary bg-primary/10 text-xs font-mono font-semibold text-primary"
                title={`Đáp án: ${token.answer}`}
              >
                [{token.answer}]
              </span>
            );
          }
          return (
            <span
              key={index}
              data-testid="formatted-blank"
              className="inline-block min-w-[3.5rem] border-b-2 border-foreground/60 mx-1 px-1 text-center font-mono font-semibold text-primary"
            >
              _____
            </span>
          );
        }

        return <React.Fragment key={index}>{token.value}</React.Fragment>;
      })}
    </span>
  );
};
