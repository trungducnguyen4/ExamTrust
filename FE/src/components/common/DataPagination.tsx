"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DataPaginationProps {
  /** Current active page (1-indexed) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Total number of items (displayed in info text) */
  totalItems?: number;
  /** Called when user changes the page */
  onPageChange: (page: number) => void;
  /** Label for items, e.g. "users", "questions" */
  itemLabel?: string;
  /** Extra class names for the wrapper */
  className?: string;
  /** Whether to sync the page with URL ?page=N (default: true) */
  syncUrl?: boolean;
  /** URL search param key (default: "page") */
  urlParamKey?: string;
}

/**
 * Unified pagination controls used across all data-listing pages.
 *
 * Renders:  Page info  |  [Previous]  [ page input / totalPages ]  [Next]
 *
 * Supports:
 * - Page jump via input field (press Enter or blur)
 * - URL sync via ?page=N search param
 * - Disabled states at boundary pages
 */
export function DataPagination({
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
  itemLabel = "mục",
  className,
  syncUrl = true,
  urlParamKey = "page",
}: DataPaginationProps) {
  const effectiveTotalPages = Math.max(1, totalPages);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [inputValue, setInputValue] = useState(String(currentPage));

  // Keep input in sync with currentPage prop
  useEffect(() => {
    setInputValue(String(currentPage));
  }, [currentPage]);

  // On mount: read page from URL if syncUrl is enabled
  useEffect(() => {
    if (!syncUrl) return;
    const urlPage = searchParams.get(urlParamKey);
    if (urlPage) {
      const parsed = Number(urlPage);
      if (
        !Number.isNaN(parsed) &&
        parsed >= 1 &&
        parsed <= effectiveTotalPages &&
        parsed !== currentPage
      ) {
        onPageChange(parsed);
      }
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changePage = useCallback(
    (newPage: number) => {
      const clamped = Math.max(1, Math.min(effectiveTotalPages, newPage));
      onPageChange(clamped);

      if (syncUrl) {
        const next = new URLSearchParams(searchParams.toString());
        if (clamped <= 1) {
          next.delete(urlParamKey);
        } else {
          next.set(urlParamKey, String(clamped));
        }
        const query = next.toString();
        // `scroll: false` is the actual fix: Next.js router navigation
        // scrolls to top by default, which is what was yanking the page
        // back up every time someone clicked Trước/Sau from the bottom of
        // a long list. Without syncUrl, onPageChange() alone never
        // triggers a router navigation, so there's nothing to suppress.
        router.replace((query ? `${pathname}?${query}` : pathname) as any, { scroll: false });
      }
    },
    [effectiveTotalPages, onPageChange, pathname, router, searchParams, syncUrl, urlParamKey],
  );

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const parsed = Number(inputValue);
      if (!Number.isNaN(parsed)) {
        changePage(parsed);
      } else {
        setInputValue(String(currentPage));
      }
    }
  };

  const handleInputBlur = () => {
    const parsed = Number(inputValue);
    if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= effectiveTotalPages) {
      changePage(parsed);
    } else {
      setInputValue(String(currentPage));
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      {/* Left: page info */}
      <p className="text-sm font-medium text-foreground whitespace-nowrap">
        Trang {currentPage} / {effectiveTotalPages}
        {totalItems !== undefined && (
          <span>
            {" "}
            ({totalItems} {itemLabel})
          </span>
        )}
      </p>

      {/* Right: controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => changePage(currentPage - 1)}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Trước
        </Button>

        {/* Page jump input */}
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={1}
            max={effectiveTotalPages}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={handleInputBlur}
            className="h-8 w-16 text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-sm font-medium text-foreground">/ {effectiveTotalPages}</span>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={currentPage >= effectiveTotalPages}
          onClick={() => changePage(currentPage + 1)}
          className="gap-1"
        >
          Sau
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

