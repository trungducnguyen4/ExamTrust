import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ApiKeyConfigDialog } from "./ApiKeyConfigDialog";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: {
    verifyAiKey: vi.fn(),
  },
}));

describe("ApiKeyConfigDialog (BYOK AI Configuration)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders configuration dialog and auto-detects Google Gemini key", async () => {
    const onOpenChange = vi.fn();
    const onConfigChange = vi.fn();

    render(
      <ApiKeyConfigDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfigChange={onConfigChange}
      />
    );

    expect(screen.getByText("Cấu hình Khóa AI (Bring Your Own Key)")).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/AIzaSy/i);
    fireEvent.change(input, { target: { value: "AIzaSyDummyGeminiKey12345" } });

    // Should display auto-detect badge
    expect(screen.getByText(/Auto-detect: Google Gemini/i)).toBeInTheDocument();
  });

  it("auto-detects Anthropic Claude and Groq keys properly", async () => {
    const onOpenChange = vi.fn();

    render(
      <ApiKeyConfigDialog
        open={true}
        onOpenChange={onOpenChange}
      />
    );

    const input = screen.getByPlaceholderText(/AIzaSy/i);
    
    // Test Anthropic
    fireEvent.change(input, { target: { value: "sk-ant-dummy-anthropic-key" } });
    expect(screen.getByText(/Auto-detect: Anthropic Claude/i)).toBeInTheDocument();

    // Test Groq
    fireEvent.change(input, { target: { value: "gsk_dummy_groq_key" } });
    expect(screen.getByText(/Auto-detect: Groq/i)).toBeInTheDocument();
  });

  it("verifies key successfully and displays response latency badge", async () => {
    (api.verifyAiKey as any).mockResolvedValueOnce({
      valid: true,
      provider: "google",
      providerName: "Google Gemini",
      responseTimeMs: 125,
      message: "Xác thực Google Gemini thành công (12 models khả dụng)",
    });

    const onOpenChange = vi.fn();
    const onConfigChange = vi.fn();

    render(
      <ApiKeyConfigDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfigChange={onConfigChange}
      />
    );

    const input = screen.getByPlaceholderText(/AIzaSy/i);
    fireEvent.change(input, { target: { value: "AIzaSyValidKey123" } });

    const verifyBtn = screen.getByRole("button", { name: /Kiểm tra Key/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(api.verifyAiKey).toHaveBeenCalledWith({
        apiKey: "AIzaSyValidKey123",
        provider: "google",
        model: "gemini-1.5-flash",
      });
      expect(screen.getByText("Khóa hoạt động tốt")).toBeInTheDocument();
      expect(screen.getByText("125 ms")).toBeInTheDocument();
    });

    // Save config
    const saveBtn = screen.getByRole("button", { name: /Lưu cấu hình/i });
    fireEvent.click(saveBtn);

    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "AIzaSyValidKey123",
        provider: "google",
        isValidated: true,
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("handles verification failure and displays error diagnostic", async () => {
    (api.verifyAiKey as any).mockResolvedValueOnce({
      valid: false,
      provider: "google",
      providerName: "Google Gemini",
      responseTimeMs: 80,
      message: "Không thể kết nối đến Google Gemini: API_KEY_INVALID",
      error: "API_KEY_INVALID",
    });

    render(
      <ApiKeyConfigDialog
        open={true}
        onOpenChange={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/AIzaSy/i);
    fireEvent.change(input, { target: { value: "AIzaSyInvalidKey" } });

    const verifyBtn = screen.getByRole("button", { name: /Kiểm tra Key/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(screen.getByText("Không thể sử dụng khóa này")).toBeInTheDocument();
      expect(screen.getAllByText(/API_KEY_INVALID/i).length).toBeGreaterThan(0);
    });
  });

  it("allows resetting back to system default key", async () => {
    const onConfigChange = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ApiKeyConfigDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfigChange={onConfigChange}
      />
    );

    const defaultBtn = screen.getByRole("button", { name: /Dùng mặc định hệ thống/i });
    fireEvent.click(defaultBtn);

    expect(onConfigChange).toHaveBeenCalledWith(null);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
