"use client";

import React, { useRef, useImperativeHandle, forwardRef, useState } from "react";
import { Link2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface RichTextEditorRef {
  insertText: (text: string, cursorOffset?: number) => void;
  focus: () => void;
  getTextarea: () => HTMLTextAreaElement | null;
}

export interface RichTextEditorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  textareaClassName?: string;
  disabled?: boolean;
  compact?: boolean;
  extraActions?: React.ReactNode;
}

export const RichTextEditor = forwardRef<RichTextEditorRef, RichTextEditorProps>(
  (
    {
      id,
      value,
      onChange,
      placeholder = "Nhập nội dung...",
      rows = 4,
      className = "",
      textareaClassName = "",
      disabled = false,
      compact = false,
      extraActions,
    },
    ref
  ) => {
    const internalRef = useRef<HTMLTextAreaElement | null>(null);
    const [linkUrl, setLinkUrl] = useState("");
    const [isLinkOpen, setIsLinkOpen] = useState(false);

    useImperativeHandle(ref, () => ({
      insertText: (text: string, cursorOffset?: number) => {
        const el = internalRef.current;
        if (!el) {
          onChange(value + text);
          return;
        }
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        const before = value.slice(0, start);
        const after = value.slice(end);
        const next = before + text + after;
        onChange(next);
        const pos = start + (cursorOffset ?? text.length);
        setTimeout(() => {
          el.focus();
          el.setSelectionRange(pos, pos);
        }, 0);
      },
      focus: () => {
        internalRef.current?.focus();
      },
      getTextarea: () => internalRef.current,
    }));

    const wrapSelection = (prefix: string, suffix: string, defaultText = "văn bản") => {
      const el = internalRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = value.slice(start, end);

      if (selected.length > 0) {
        // Toggle off if already wrapped
        if (
          value.slice(Math.max(0, start - prefix.length), start) === prefix &&
          value.slice(end, end + suffix.length) === suffix
        ) {
          const unwrapped =
            value.slice(0, start - prefix.length) +
            selected +
            value.slice(end + suffix.length);
          onChange(unwrapped);
          setTimeout(() => {
            el.focus();
            el.setSelectionRange(start - prefix.length, end - prefix.length);
          }, 0);
          return;
        }

        const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
        onChange(next);
        setTimeout(() => {
          el.focus();
          el.setSelectionRange(start + prefix.length, end + prefix.length);
        }, 0);
      } else {
        const next = value.slice(0, start) + prefix + defaultText + suffix + value.slice(end);
        onChange(next);
        setTimeout(() => {
          el.focus();
          el.setSelectionRange(start + prefix.length, start + prefix.length + defaultText.length);
        }, 0);
      }
    };

    const prefixLines = (prefixFn: (index: number) => string) => {
      const el = internalRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;

      // Find full line boundaries
      const firstLineStart = value.lastIndexOf("\n", start - 1) + 1;
      const lastLineEnd = value.indexOf("\n", end);
      const effectiveEnd = lastLineEnd === -1 ? value.length : lastLineEnd;

      const targetText = value.slice(firstLineStart, effectiveEnd);
      const lines = targetText.split("\n");
      const formattedLines = lines.map((line, idx) => {
        const p = prefixFn(idx);
        return line.startsWith(p) ? line.slice(p.length) : `${p}${line}`;
      });

      const replacement = formattedLines.join("\n");
      const next = value.slice(0, firstLineStart) + replacement + value.slice(effectiveEnd);
      onChange(next);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(firstLineStart, firstLineStart + replacement.length);
      }, 0);
    };

    const handleClearFormatting = () => {
      const el = internalRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (start === end) return;

      const selected = value.slice(start, end);
      // Strip markdown & HTML tags
      let cleaned = selected
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/~~(.*?)~~/g, "$1")
        .replace(/<u>(.*?)<\/u>/gi, "$1")
        .replace(/<s>(.*?)<\/s>/gi, "$1")
        .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
        .replace(/^[\s]*[-*+]\s+/gm, "")
        .replace(/^[\s]*\d+\.\s+/gm, "")
        .replace(/^[\s]*>\s+/gm, "");

      const next = value.slice(0, start) + cleaned + value.slice(end);
      onChange(next);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start, start + cleaned.length);
      }, 0);
    };

    const handleInsertLink = () => {
      if (!linkUrl.trim()) {
        setIsLinkOpen(false);
        return;
      }
      const el = internalRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = value.slice(start, end) || "liên kết";
      const formatted = `[${selected}](${linkUrl.trim()})`;
      const next = value.slice(0, start) + formatted + value.slice(end);
      onChange(next);
      setLinkUrl("");
      setIsLinkOpen(false);
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + formatted.length, start + formatted.length);
      }, 0);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key === "b" || e.key === "B") {
          e.preventDefault();
          wrapSelection("**", "**", "chữ đậm");
        } else if (e.key === "i" || e.key === "I") {
          e.preventDefault();
          wrapSelection("*", "*", "chữ nghiêng");
        } else if (e.key === "u" || e.key === "U") {
          e.preventDefault();
          wrapSelection("<u>", "</u>", "gạch chân");
        }
      }
    };

    return (
      <div className={`overflow-hidden rounded-lg border border-input bg-card shadow-sm transition-colors focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/40 ${className}`}>
        {/* Toolbar matching Image 2 style */}
        <div className="flex flex-wrap items-center gap-1 border-b border-border/80 bg-slate-50/90 px-2.5 py-1.5 dark:bg-slate-900/60">
          <TooltipProvider delayDuration={300}>
            {/* Bold */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => wrapSelection("**", "**", "chữ đậm")}
                  className="flex h-7 w-7 items-center justify-center rounded text-sm font-bold text-slate-800 hover:bg-slate-200/80 active:bg-slate-300 dark:text-slate-200 dark:hover:bg-slate-800"
                  aria-label="Chữ đậm (Ctrl+B)"
                >
                  B
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Chữ đậm (Ctrl+B)</TooltipContent>
            </Tooltip>

            {/* Italic */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => wrapSelection("*", "*", "chữ nghiêng")}
                  className="flex h-7 w-7 items-center justify-center rounded font-serif text-sm italic font-bold text-slate-800 hover:bg-slate-200/80 active:bg-slate-300 dark:text-slate-200 dark:hover:bg-slate-800"
                  aria-label="Chữ nghiêng (Ctrl+I)"
                >
                  I
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Chữ nghiêng (Ctrl+I)</TooltipContent>
            </Tooltip>

            {/* Underline */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => wrapSelection("<u>", "</u>", "gạch chân")}
                  className="flex h-7 w-7 items-center justify-center rounded text-sm font-bold underline decoration-2 underline-offset-2 text-slate-800 hover:bg-slate-200/80 active:bg-slate-300 dark:text-slate-200 dark:hover:bg-slate-800"
                  aria-label="Gạch chân (Ctrl+U)"
                >
                  U
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Gạch chân (Ctrl+U)</TooltipContent>
            </Tooltip>

            {/* Strikethrough */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => wrapSelection("~~", "~~", "gạch ngang")}
                  className="flex h-7 w-7 items-center justify-center rounded text-sm font-bold line-through decoration-2 text-slate-800 hover:bg-slate-200/80 active:bg-slate-300 dark:text-slate-200 dark:hover:bg-slate-800"
                  aria-label="Gạch ngang"
                >
                  S
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Gạch ngang</TooltipContent>
            </Tooltip>

            {/* Divider 1 */}
            <div className="mx-1 h-4 w-px bg-slate-300 dark:bg-slate-700" />

            {!compact && (
              <>
                {/* Bullet List */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => prefixLines(() => "- ")}
                      className="flex h-7 w-7 items-center justify-center rounded text-base font-bold text-slate-800 hover:bg-slate-200/80 active:bg-slate-300 dark:text-slate-200 dark:hover:bg-slate-800"
                      aria-label="Danh sách dấu chấm"
                    >
                      •
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Danh sách dấu chấm</TooltipContent>
                </Tooltip>

                {/* Numbered List */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => prefixLines((idx) => `${idx + 1}. `)}
                      className="flex h-7 w-7 items-center justify-center rounded font-mono text-xs font-bold text-slate-800 hover:bg-slate-200/80 active:bg-slate-300 dark:text-slate-200 dark:hover:bg-slate-800"
                      aria-label="Danh sách đánh số"
                    >
                      1.
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Danh sách đánh số</TooltipContent>
                </Tooltip>

                {/* Quote */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => prefixLines(() => "> ")}
                      className="flex h-7 w-7 items-center justify-center rounded font-serif text-sm font-bold text-slate-800 hover:bg-slate-200/80 active:bg-slate-300 dark:text-slate-200 dark:hover:bg-slate-800"
                      aria-label="Trích dẫn"
                    >
                      “
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Trích dẫn</TooltipContent>
                </Tooltip>

                {/* Divider 2 */}
                <div className="mx-1 h-4 w-px bg-slate-300 dark:bg-slate-700" />
              </>
            )}

            {/* Insert Link */}
            <Popover open={isLinkOpen} onOpenChange={setIsLinkOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={disabled}
                      className="flex h-7 w-7 items-center justify-center rounded text-slate-800 hover:bg-slate-200/80 active:bg-slate-300 dark:text-slate-200 dark:hover:bg-slate-800"
                      aria-label="Chèn liên kết"
                    >
                      <Link2 className="h-4 w-4" />
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">Chèn liên kết</TooltipContent>
              </Tooltip>
              <PopoverContent className="w-80 p-3" align="start">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Chèn URL liên kết:</p>
                  <div className="flex gap-2">
                    <Input
                      type="url"
                      placeholder="https://..."
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleInsertLink()}
                      className="h-8 text-xs"
                    />
                    <Button size="sm" className="h-8 px-3 text-xs" onClick={handleInsertLink}>
                      Chèn
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Clear Formatting Tx */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={handleClearFormatting}
                  className="flex h-7 w-7 items-center justify-center rounded text-sm font-bold text-slate-800 hover:bg-slate-200/80 active:bg-slate-300 dark:text-slate-200 dark:hover:bg-slate-800"
                  aria-label="Xóa định dạng"
                >
                  <span className="leading-none">T</span>
                  <sub className="text-[10px] font-normal leading-none">x</sub>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">Xóa định dạng vùng chọn</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Extra slot (e.g. Add Blank button for fill-in-blank) */}
          {extraActions && (
            <div className="ml-auto flex items-center gap-1.5">
              {extraActions}
            </div>
          )}
        </div>

        {/* Textarea Area */}
        <textarea
          ref={internalRef}
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className={`w-full resize-y border-0 bg-transparent px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 ${textareaClassName}`}
        />
      </div>
    );
  }
);

RichTextEditor.displayName = "RichTextEditor";
