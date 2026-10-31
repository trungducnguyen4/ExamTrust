import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuestionBankDonutStats } from "./QuestionBankDonutStats";
import type { Question } from "../question-bank-utils";

describe("QuestionBankDonutStats component", () => {
  const mockCourses = [
    { id: "c1", code: "CS101", name: "Nhập môn Lập trình" },
    { id: "c2", code: "CS102", name: "Cấu trúc dữ liệu" },
  ];

  const mockQuestions: Question[] = [
    {
      id: "q1",
      content: "Câu hỏi 1",
      type: "MULTIPLE_CHOICE",
      course: { id: "c1", code: "CS101", name: "Nhập môn Lập trình" },
      difficulty: 2, // Dễ (<=4)
      points: 1,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "q2",
      content: "Câu hỏi 2",
      type: "MULTIPLE_CHOICE",
      course: { id: "c1", code: "CS101", name: "Nhập môn Lập trình" },
      difficulty: 5, // Trung bình (==5)
      points: 1,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "q3",
      content: "Câu hỏi 3",
      type: "ESSAY",
      course: { id: "c1", code: "CS101", name: "Nhập môn Lập trình" },
      difficulty: 8, // Khó (>5)
      points: 2,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "q4",
      content: "Câu hỏi 4",
      type: "TRUE_FALSE",
      course: { id: "c2", code: "CS102", name: "Cấu trúc dữ liệu" },
      difficulty: 3, // Dễ
      points: 1,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
  ];

  it("renders 3 donut cards with total questions, courses and average difficulty", () => {
    render(
      <QuestionBankDonutStats
        questions={mockQuestions}
        courses={mockCourses}
        avgDifficulty="4.5"
      />,
    );

    // Verify main card titles
    expect(screen.getByText("Tổng số câu hỏi")).toBeInTheDocument();
    expect(screen.getByText("Khóa học đào tạo")).toBeInTheDocument();
    expect(screen.getByText("Phân bố độ khó")).toBeInTheDocument();

    // Verify center values in donuts
    const centerValues = screen.getAllByTestId("donut-center-primary").map((el) => el.textContent);
    expect(centerValues).toContain("4"); // 4 total questions
    expect(centerValues).toContain("2"); // 2 courses
    expect(centerValues).toContain("4.5"); // avg difficulty

    // Verify difficulty breakdown: 2 Dễ (q1, q4), 1 Trung bình (q2), 1 Khó (q3)
    expect(screen.getAllByText(/2 câu/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/1 câu/i).length).toBeGreaterThanOrEqual(1);
  });

  it("handles zero questions and empty states gracefully without crashing", () => {
    render(
      <QuestionBankDonutStats
        questions={[]}
        courses={mockCourses}
        avgDifficulty="0"
      />,
    );

    expect(screen.getByText("Chưa có câu hỏi")).toBeInTheDocument();
    const centerValues = screen.getAllByTestId("donut-center-primary").map((el) => el.textContent);
    expect(centerValues).toContain("0");
  });
});
