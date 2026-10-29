import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  RotateCcw,
  ShieldCheck,
  Zap,
  ExternalLink,
  ClipboardPaste,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  AI_PROVIDERS,
  detectAiProvider,
  getUserAiConfig,
  saveUserAiConfig,
  clearUserAiConfig,
  SupportedAiProvider,
  UserAiConfig,
} from "@/lib/ai-key-storage";

interface ApiKeyConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigChange?: (config: UserAiConfig | null) => void;
}

export function ApiKeyConfigDialog({
  open,
  onOpenChange,
  onConfigChange,
}: ApiKeyConfigDialogProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<SupportedAiProvider>("google");
  const [selectedModel, setSelectedModel] = useState("gemini-1.5-flash");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    message: string;
    responseTimeMs?: number;
    error?: string;
    modelsCount?: number;
  } | null>(null);

  // Auto-detection state
  const [detected, setDetected] = useState<{
    provider: SupportedAiProvider;
    providerName: string;
    confidence: "high" | "medium" | "low";
  }>({
    provider: "unknown",
    providerName: "Chưa nhập",
    confidence: "low",
  });

  // Load existing config on open
  useEffect(() => {
    if (open) {
      const current = getUserAiConfig();
      if (current) {
        setApiKey(current.apiKey);
        setSelectedProvider(current.provider);
        setSelectedModel(current.model);
        if (current.isValidated) {
          setVerificationResult({
            valid: true,
            message: `Khóa đã được xác thực trước đó (${current.providerName}).`,
            responseTimeMs: current.responseTimeMs,
          });
        }
      } else {
        setApiKey("");
        setSelectedProvider("google");
        setSelectedModel("gemini-1.5-flash");
        setVerificationResult(null);
      }
    }
  }, [open]);

  // Run auto-detection whenever apiKey changes
  useEffect(() => {
    const det = detectAiProvider(apiKey);
    setDetected({
      provider: det.provider,
      providerName: det.providerName,
      confidence: det.confidence,
    });

    // If high-confidence auto-detect matches a known provider, automatically select it
    if (det.confidence === "high" && det.provider !== "unknown") {
      setSelectedProvider(det.provider);
      setSelectedModel(det.recommendedModel);
    }
  }, [apiKey]);

  const currentProviderMeta =
    AI_PROVIDERS.find((p) => p.id === selectedProvider) || AI_PROVIDERS[0];

  const handleProviderChange = (newProvider: SupportedAiProvider) => {
    setSelectedProvider(newProvider);
    const meta = AI_PROVIDERS.find((p) => p.id === newProvider);
    if (meta) {
      setSelectedModel(meta.defaultModel);
    }
    setVerificationResult(null);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setApiKey(text.trim());
        toast.info("Đã dán API key từ bộ nhớ tạm");
      }
    } catch {
      toast.error("Không thể đọc bộ nhớ tạm. Vui lòng dán thủ công.");
    }
  };

  const handleVerify = async () => {
    if (!apiKey.trim()) {
      toast.error("Vui lòng nhập API key trước khi kiểm tra.");
      return;
    }

    setIsVerifying(true);
    setVerificationResult(null);

    try {
      const res = await api.verifyAiKey({
        apiKey: apiKey.trim(),
        provider: selectedProvider,
        model: selectedModel,
      });

      if (res.valid) {
        setVerificationResult({
          valid: true,
          message: res.message || "Xác thực API key thành công!",
          responseTimeMs: res.responseTimeMs,
          modelsCount: res.details?.modelsCount,
        });
        toast.success(`Khóa ${res.providerName} hợp lệ! (Phản hồi ${res.responseTimeMs}ms)`);
      } else {
        setVerificationResult({
          valid: false,
          message: res.message || "Khóa API không hợp lệ hoặc không có quyền truy cập.",
          error: res.error,
          responseTimeMs: res.responseTimeMs,
        });
        toast.error(`Kiểm tra thất bại: ${res.error || "Khóa không hợp lệ"}`);
      }
    } catch (err: any) {
      setVerificationResult({
        valid: false,
        message: err?.message || "Lỗi mạng hoặc không thể kết nối đến máy chủ xác thực.",
        error: String(err),
      });
      toast.error("Lỗi khi kiểm tra khóa: " + (err?.message || "Không thể kết nối"));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSave = () => {
    if (!apiKey.trim()) {
      toast.error("Vui lòng nhập API key.");
      return;
    }

    const config: UserAiConfig = {
      apiKey: apiKey.trim(),
      provider: selectedProvider,
      providerName: currentProviderMeta.name,
      model: selectedModel,
      isValidated: verificationResult?.valid ?? false,
      validatedAt: Date.now(),
      responseTimeMs: verificationResult?.responseTimeMs,
    };

    saveUserAiConfig(config);
    if (onConfigChange) onConfigChange(config);
    toast.success(`Đã lưu cấu hình khóa cá nhân (${currentProviderMeta.name}) thành công!`);
    onOpenChange(false);
  };

  const handleClear = () => {
    clearUserAiConfig();
    setApiKey("");
    setVerificationResult(null);
    if (onConfigChange) onConfigChange(null);
    toast.info("Đã khôi phục về sử dụng khóa AI mặc định của hệ thống.");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">Cấu hình Khóa AI (Bring Your Own Key)</DialogTitle>
              <DialogDescription>
                Nhập API Key cá nhân để sử dụng mô hình AI của riêng bạn. Hệ thống tự động nhận diện và kiểm tra tính hợp lệ.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* API Key Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="apiKeyInput" className="text-sm font-semibold flex items-center gap-1.5">
                <span>API Key cá nhân</span>
                {detected.confidence === "high" && (
                  <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1 py-0">
                    <Sparkles className="h-3 w-3" />
                    Auto-detect: {detected.providerName}
                  </Badge>
                )}
              </Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handlePaste}
                  className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  Dán key
                </Button>
              </div>
            </div>

            <div className="relative">
              <Input
                id="apiKeyInput"
                type={showKey ? "text" : "password"}
                placeholder={currentProviderMeta.placeholder}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setVerificationResult(null);
                }}
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {currentProviderMeta.description}
            </p>
          </div>

          {/* Provider & Model Selectors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Nhà cung cấp AI (Provider)</Label>
              <Select
                value={selectedProvider}
                onValueChange={(val) => handleProviderChange(val as SupportedAiProvider)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Chọn nhà cung cấp" />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Mô hình đề xuất (Model)</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="h-9 text-xs font-mono">
                  <SelectValue placeholder="Chọn model" />
                </SelectTrigger>
                <SelectContent>
                  {currentProviderMeta.models.map((m) => (
                    <SelectItem key={m} value={m} className="text-xs font-mono">
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Verification Status Card */}
          {verificationResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-1.5 transition-all ${
                verificationResult.valid
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200"
                  : "bg-destructive/10 border-destructive/30 text-destructive dark:text-destructive-foreground"
              }`}
            >
              <div className="flex items-center gap-2 font-medium">
                {verificationResult.valid ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                )}
                <span>{verificationResult.valid ? "Khóa hoạt động tốt" : "Không thể sử dụng khóa này"}</span>
                {verificationResult.responseTimeMs !== undefined && (
                  <Badge variant="outline" className="ml-auto text-[10px] py-0 border-current font-mono">
                    {verificationResult.responseTimeMs} ms
                  </Badge>
                )}
              </div>
              <p className="opacity-90 leading-relaxed">{verificationResult.message}</p>
              {verificationResult.error && (
                <p className="font-mono text-[11px] opacity-75">Chi tiết: {verificationResult.error}</p>
              )}
            </div>
          )}

          {/* Quick Info & Security Assurance */}
          <div className="rounded-xl border border-border/50 bg-muted/30 p-3 flex items-start gap-2.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-medium text-foreground">Bảo mật & Mã hóa</p>
              <p className="text-[11px]">
                API Key được lưu an toàn trong trình duyệt của bạn (Local Storage) và chỉ dùng khi gửi yêu cầu AI. Nếu không nhập, hệ thống sẽ sử dụng khóa mặc định được trường cấp.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2 border-t border-border/50">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="text-xs text-muted-foreground hover:text-destructive gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Dùng mặc định hệ thống
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleVerify}
              disabled={isVerifying || !apiKey.trim()}
              className="text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Đang kiểm tra...
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5" />
                  Kiểm tra Key
                </>
              )}
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!apiKey.trim()}
              className="text-xs gap-1.5"
            >
              Lưu cấu hình
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
export default ApiKeyConfigDialog;
