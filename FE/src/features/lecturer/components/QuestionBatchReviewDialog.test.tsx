import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuestionBatchReviewDialog, type BatchGeneratedQuestion } from "./QuestionBatchReviewDialog";

describe("QuestionBatchReviewDialog", () => {
  const sampleQuestions: BatchGeneratedQuestion[] = [
    {
      content: "Giao thức nào thuộc tầng Giao vận trong mô hình TCP/IP?",
      type: "MULTIPLE_CHOICE",
      difficulty: 2,
      explanation: "TCP và UDP hoạt động tại tầng Giao vận (Transport layer).",
      options: {
        A: "HTTP",
        B: "TCP",
        C: "IP",
        D: "Ethernet",
      },
      correctAnswer: { answer: "B" },
    },
    {
      content: "Địa chỉ IPv4 có độ dài bao nhiêu bit?",
      type: "MULTIPLE_CHOICE",
      difficulty: 1,
      explanation: "IPv4 sử dụng 32 bit, trong khi IPv6 sử dụng 128 bit.",
      options: {
        A: "32 bit",
        B: "64 bit",
        C: "128 bit",
        D: "16 bit",
      },
      correctAnswer: { answer: "A" },
    },
  ];

  it("renders generated questions with correct options and triggers single apply", () => {
    const onApplySingle = vi.fn();
    const onSaveToBank = vi.fn().mockResolvedValue(undefined);
    const onSaveAllToBank = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <QuestionBatchReviewDialog
        open={true}
        questions={sampleQuestions}
        courseName="Mạng máy tính"
        onClose={onClose}
        onApplySingle={onApplySingle}
        onSaveToBank={onSaveToBank}
        onSaveAllToBank={onSaveAllToBank}
      />
    );

    expect(screen.getByText(/Bộ câu hỏi AI vừa tạo \(2 câu\)/i)).toBeInTheDocument();
    expect(screen.getByText("Giao thức nào thuộc tầng Giao vận trong mô hình TCP/IP?")).toBeInTheDocument();
    expect(screen.getByText("Địa chỉ IPv4 có độ dài bao nhiêu bit?")).toBeInTheDocument();

    // Click "Điền vào form" on question 1
    const applyButtons = screen.getAllByRole("button", { name: /Điền vào form/i });
    fireEvent.click(applyButtons[0]);

    expect(onApplySingle).toHaveBeenCalledWith(sampleQuestions[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("triggers save all to bank", async () => {
    const onSaveAllToBank = vi.fn().mockResolvedValue(undefined);

    render(
      <QuestionBatchReviewDialog
        open={true}
        questions={sampleQuestions}
        courseName="Mạng máy tính"
        onClose={vi.fn()}
        onApplySingle={vi.fn()}
        onSaveToBank={vi.fn().mockResolvedValue(undefined)}
        onSaveAllToBank={onSaveAllToBank}
      />
    );

    const saveAllBtn = screen.getByRole("button", { name: /Lưu tất cả 2 câu vào ngân hàng/i });
    fireEvent.click(saveAllBtn);

    expect(onSaveAllToBank).toHaveBeenCalledWith(sampleQuestions);
  });
});
