"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ListToolbarProps {
  search?: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function ListToolbar({
  search,
  filters,
  actions,
  children,
  className,
}: ListToolbarProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-2 sm:p-2.5 shadow-sm",
        "flex flex-col gap-3 2xl:flex-row 2xl:items-center",
        className,
      )}
    >
      {search && (
        <div className="min-w-0 flex-1 sm:min-w-[280px]">
          {search}
        </div>
      )}

      {search && (filters || actions || children) && (
        <div className="hidden 2xl:block h-6 w-px bg-border/70 shrink-0" />
      )}

      {(filters || actions || children) && (
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {filters}
          {filters && actions && (
            <div className="hidden sm:block h-6 w-px bg-border/70 shrink-0" />
          )}
          {actions}
          {children}
        </div>
      )}
    </div>
  );
}
