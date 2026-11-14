import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ManualGradingDetail from "./ManualGradingDetail";
import api from "@/lib/api";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "exam-1", submissionId: "sub-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/lecturer/exam/exam-1/submissions/sub-1/review",
}));

vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/api", () => ({
  default: {
    getManualGradingSubmission: vi.fn(),
    getEvidenceCaptures: vi.fn().mockResolvedValue([]),
    getEvidenceImageUrl: vi.fn().mockResolvedValue(""),
    reviewEvidenceCapture: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("ManualGradingDetail - Toggle Auto-Graded Questions", () => {
  const mockSubmission = {
    id: "sub-1",
    student: {
      fullName: "Nguyễn Văn Test",
      studentId: "522h0027",
      email: "522h0027@tdtu.edu.vn",
    },
    exam: {
      title: "Bài thi thử nghiệm",
    },
    submittedAt: "2026-08-10T18:39:00Z",
    autoCorrect: 7,
    autoTotal: 13,
    autoAnswers: [
      {
        id: "ans-auto-1",
        questionType: "TRUE_FALSE",
        questionText: "HAVING can be used without GROUP BY in some RDBMS.",
        maxPoints: 1,
        pointsAwarded: 0,
        isCorrect: false,
        answer: "Sai",
        correctAnswer: "Đúng",
      },
      {
        id: "ans-auto-2",
        questionType: "SINGLE_CHOICE",
        questionText: "SQL stands for Structured Query Language.",
        maxPoints: 1,
        pointsAwarded: 1,
        isCorrect: true,
        answer: "Đúng",
        correctAnswer: "Đúng",
      },
    ],
    manualAnswers: [
      {
        id: "ans-manual-1",
        questionType: "ESSAY",
        questionText: "Giải thích cơ chế ACID trong cơ sở dữ liệu.",
        maxPoints: 3,
        pointsAwarded: null,
        manualGradedAt: null,
        answer: "ACID gồm Atomicity, Consistency, Isolation, Durability...",
        feedback: "",
      },
    ],
    scoreAdjustments: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getManualGradingSubmission as any).mockResolvedValue(mockSubmission);
  });

  it("renders auto-graded card in collapsed state by default to keep UI compact", async () => {
    render(
      <TooltipProvider>
        <ManualGradingDetail />
      </TooltipProvider>
    );

    // Wait for submission to load
    await waitFor(() => {
      expect(screen.getByText("Câu tự động chấm")).toBeInTheDocument();
    });

    // Check summary badge and toggle button text
    expect(screen.getByText("Đúng 7/13")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hiện danh sách \(2 câu\)/i })).toBeInTheDocument();

    // Auto-graded questions content should be hidden by default
    expect(screen.queryByText(/HAVING can be used without GROUP BY/i)).not.toBeInTheDocument();
  });

  it("expands auto-graded questions when clicking 'Hiện danh sách' and collapses on 'Ẩn danh sách'", async () => {
    render(
      <TooltipProvider>
        <ManualGradingDetail />
      </TooltipProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("Câu tự động chấm")).toBeInTheDocument();
    });

    const toggleBtn = screen.getByRole("button", { name: /hiện danh sách \(2 câu\)/i });

    // Click to expand
    fireEvent.click(toggleBtn);

    // Questions should now be visible
    expect(screen.getByText(/HAVING can be used without GROUP BY/i)).toBeInTheDocument();
    expect(screen.getByText(/SQL stands for Structured Query Language/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ẩn danh sách/i })).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(screen.getByRole("button", { name: /ẩn danh sách/i }));

    // Questions should be hidden again
    expect(screen.queryByText(/HAVING can be used without GROUP BY/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hiện danh sách \(2 câu\)/i })).toBeInTheDocument();
  });
});
