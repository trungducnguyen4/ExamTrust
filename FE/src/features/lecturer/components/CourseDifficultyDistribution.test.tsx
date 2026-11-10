import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CourseDifficultyDistribution } from "./CourseDifficultyDistribution";

describe("CourseDifficultyDistribution", () => {
  it("renders total question count correctly when total is provided directly from course._count", () => {
    render(<CourseDifficultyDistribution total={42} />);
    expect(screen.getByTestId("dist-total-count").textContent).toBe("42");
    expect(screen.getByText("câu")).toBeDefined();
  });

  it("calculates difficulty breakdown accurately when question items are provided", () => {
    const questions = [
      { difficulty: 2 }, // easy
      { difficulty: 3 }, // easy
      { difficulty: 5 }, // medium
      { difficulty: 7 }, // hard
    ];
    render(<CourseDifficultyDistribution questions={questions} />);
    expect(screen.getByTestId("dist-total-count").textContent).toBe("4");
    // 2 easy (50%), 1 medium (25%), 1 hard (25%)
    expect(screen.getByText(/50% · 25% · 25%/)).toBeDefined();
  });

  it("handles empty course with zero questions gracefully", () => {
    render(<CourseDifficultyDistribution total={0} />);
    expect(screen.getByTestId("dist-total-count").textContent).toBe("0");
  });
});
