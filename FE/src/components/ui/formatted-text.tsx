"use client";

import React from "react";

interface FormattedTextProps {
  text?: string | null;
  className?: string;
}

/**
 * Parses inline formatting:
 * - Bold: **text**
 * - Italic: *text*
 * - Underline: <u>text</u>
 * - Strikethrough: ~~text~~ or <s>text</s>
 * - Link: [text](url)
 */
function parseInlineFormatting(text: string, baseKey = "inline"): React.ReactNode[] {
  // Regex to match inline markers
  const inlineRegex =
    /(\*\*.*?\*\*|\*[^*]+?\*|<u>.*?<\/u>|~~.*?~~|<s>.*?<\/s>|\[.*?\]\(https?:\/\/[^\s)]+\))/g;

  const parts = text.split(inlineRegex);
  return parts.map((part, index) => {
    const key = `${baseKey}-${index}`;

    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      const content = part.slice(2, -2);
      return (
        <strong key={key} className="font-bold">
          {parseInlineFormatting(content, `${key}-b`)}
        </strong>
      );
    }

    if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
      const content = part.slice(1, -1);
      return (
        <em key={key} className="italic">
          {parseInlineFormatting(content, `${key}-i`)}
        </em>
      );
    }

    if (
      part.toLowerCase().startsWith("<u>") &&
      part.toLowerCase().endsWith("</u>") &&
      part.length >= 7
    ) {
      const content = part.slice(3, -4);
      return (
        <span key={key} className="underline decoration-2 underline-offset-2">
          {parseInlineFormatting(content, `${key}-u`)}
        </span>
      );
    }

    if (
      (part.startsWith("~~") && part.endsWith("~~") && part.length >= 4) ||
      (part.toLowerCase().startsWith("<s>") && part.toLowerCase().endsWith("</s>") && part.length >= 7)
    ) {
      const content = part.startsWith("~~") ? part.slice(2, -2) : part.slice(3, -4);
      return (
        <del key={key} className="line-through decoration-2">
          {parseInlineFormatting(content, `${key}-s`)}
        </del>
      );
    }

    const linkMatch = part.match(/^\[(.*?)\]\((https?:\/\/[^\s)]+)\)$/);
    if (linkMatch) {
      const [, label, url] = linkMatch;
      return (
        <a
          key={key}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:text-primary/80"
          onClick={(e) => e.stopPropagation()}
        >
          {label || url}
        </a>
      );
    }

    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

/**
 * FormattedText:
 * Renders rich text safely with support for bold, italic, underline, strikethrough,
 * lists, quotes, and links without requiring dangerous HTML injection.
 */
export function FormattedText({ text, className = "" }: FormattedTextProps) {
  if (!text) return null;

  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let currentList: { type: "ul" | "ol"; items: string[] } | null = null;

  const flushList = () => {
    if (!currentList) return;
    const isUl = currentList.type === "ul";
    const listKey = `list-${blocks.length}`;
    if (isUl) {
      blocks.push(
        <ul key={listKey} className="my-1.5 ml-5 list-disc space-y-0.5">
          {currentList.items.map((item, i) => (
            <li key={`${listKey}-${i}`}>{parseInlineFormatting(item, `${listKey}-li-${i}`)}</li>
          ))}
        </ul>
      );
    } else {
      blocks.push(
        <ol key={listKey} className="my-1.5 ml-5 list-decimal space-y-0.5">
          {currentList.items.map((item, i) => (
            <li key={`${listKey}-${i}`}>{parseInlineFormatting(item, `${listKey}-li-${i}`)}</li>
          ))}
        </ol>
      );
    }
    currentList = null;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    // Check for bullet list
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const content = trimmed.slice(2);
      if (currentList && currentList.type === "ul") {
        currentList.items.push(content);
      } else {
        flushList();
        currentList = { type: "ul", items: [content] };
      }
      return;
    }

    // Check for numbered list
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      const content = numMatch[2];
      if (currentList && currentList.type === "ol") {
        currentList.items.push(content);
      } else {
        flushList();
        currentList = { type: "ol", items: [content] };
      }
      return;
    }

    // Not a list item
    flushList();

    // Check for blockquote
    if (trimmed.startsWith("> ")) {
      const content = trimmed.slice(2);
      blocks.push(
        <blockquote
          key={`quote-${index}`}
          className="my-1.5 border-l-4 border-primary/40 bg-muted/20 py-1 pl-3 italic text-muted-foreground"
        >
          {parseInlineFormatting(content, `quote-inline-${index}`)}
        </blockquote>
      );
      return;
    }

    // Regular paragraph / line
    if (line.trim().length === 0) {
      blocks.push(<div key={`empty-${index}`} className="h-2" />);
    } else {
      blocks.push(
        <div key={`p-${index}`} className="leading-relaxed">
          {parseInlineFormatting(line, `p-inline-${index}`)}
        </div>
      );
    }
  });

  flushList();

  return <div className={`formatted-text break-words ${className}`}>{blocks}</div>;
}
