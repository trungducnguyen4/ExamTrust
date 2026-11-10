import React from "react";
import { ShieldAlert, AlertTriangle, X, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface GuardrailResult {
  guardrailBlocked: boolean;
  offendingKeywords: string[];
  detectedDomain?: string;
  courseDomain?: string;
  reason?: string;
  suggestion?: string;
}

interface GuardrailAlertBannerProps {
  guardrailResult: GuardrailResult | null;
  courseName?: string;
  onDismiss?: () => void;
  className?: string;
}

export function GuardrailAlertBanner({
  guardrailResult,
  courseName,
  onDismiss,
  className = "",
}: GuardrailAlertBannerProps) {
  if (!guardrailResult || !guardrailResult.guardrailBlocked) {
    return null;
  }

  const { offendingKeywords = [], detectedDomain, courseDomain, reason, suggestion } = guardrailResult;

  return (
    <div
      role="alert"
      data-testid="guardrail-alert-banner"
      className={`relative rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-100 shadow-sm transition-all ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-amber-500/20 p-2 text-amber-600 dark:text-amber-400">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Cơ chế Topic Guardrails đã từ chối yêu cầu
              </h4>
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/15 text-xs text-amber-800 dark:text-amber-300">
                Bảo vệ ranh giới học phần
              </Badge>
            </div>
            <p className="text-xs text-amber-800/90 dark:text-amber-200/90 leading-relaxed">
              {reason || "Nội dung yêu cầu không thuộc phạm vi kiến thức chuyên môn của học phần hiện tại."}
            </p>
          </div>
        </div>
        {onDismiss && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDismiss}
            aria-label="Đóng cảnh báo Guardrails"
            className="h-7 w-7 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="mt-3 grid gap-2 pl-11 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground font-medium">Học phần:</span>
          <Badge variant="outline" className="bg-background/80 font-normal">
            {courseName || courseDomain || "Công nghệ Thông tin / CS"}
          </Badge>

          {detectedDomain && (
            <>
              <span className="text-muted-foreground font-medium ml-1">Miền phát hiện:</span>
              <Badge variant="secondary" className="font-normal border border-amber-500/30 bg-amber-500/15 text-amber-900 dark:text-amber-200">
                {detectedDomain}
              </Badge>
            </>
          )}
        </div>

        {offendingKeywords.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-destructive font-medium flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Từ khóa vi phạm:
            </span>
            {offendingKeywords.map((kw) => (
              <Badge
                key={kw}
                variant="destructive"
                className="bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30 font-semibold px-2 py-0.5"
              >
                {kw}
              </Badge>
            ))}
          </div>
        )}

        {suggestion && (
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-background/60 p-2.5 border border-amber-500/20 text-muted-foreground text-xs leading-relaxed">
            <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-foreground">Gợi ý chuẩn hóa: </span>
              {suggestion}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
