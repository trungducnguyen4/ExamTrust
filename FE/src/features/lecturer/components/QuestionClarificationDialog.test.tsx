import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuestionClarificationDialog } from "./QuestionClarificationDialog";

describe("QuestionClarificationDialog (Grill-me modal)", () => {
  it("renders pedagogical options and submits enriched config", () => {
    const onConfirm = vi.fn();
    const onSkip = vi.fn();
    const onClose = vi.fn();

    render(
      <QuestionClarificationDialog
        open={true}
        prompt="Mô hình OSI và TCP/IP"
        questionCount={3}
        courseName="Mạng máy tính"
        onClose={onClose}
        onConfirm={onConfirm}
        onSkip={onSkip}
      />
    );

    expect(screen.getByText("Grill-me Mode")).toBeInTheDocument();
    expect(screen.getByText(/Làm rõ yêu cầu sư phạm/i)).toBeInTheDocument();
    expect(screen.getByText(/"Mô hình OSI và TCP\/IP"/i)).toBeInTheDocument();
    expect(screen.getByText("Sinh 3 câu hỏi")).toBeInTheDocument();

    // Select different options
    fireEvent.click(screen.getByText("Đánh giá & So sánh"));
    fireEvent.click(screen.getByText("Đoạn mã & Debugging"));

    // Enter custom notes
    const textarea = screen.getByPlaceholderText(/Tập trung vào tầng Giao vận/i);
    fireEvent.change(textarea, { target: { value: "Nhấn mạnh vào 3-way handshake" } });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /Xác nhận & Bắt đầu tạo/i }));

    expect(onConfirm).toHaveBeenCalledWith({
      bloomLevel: "EVALUATE",
      style: "CODE_ANALYSIS",
      distractorDepth: "COMMON_PITFALLS",
      timeEstimate: "MEDIUM",
      customNotes: "Nhấn mạnh vào 3-way handshake",
    });
  });

  it("handles skip button correctly", () => {
    const onSkip = vi.fn();
    render(
      <QuestionClarificationDialog
        open={true}
        prompt="Hệ điều hành Linux"
        questionCount={1}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onSkip={onSkip}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Bỏ qua & Tạo ngay/i }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
