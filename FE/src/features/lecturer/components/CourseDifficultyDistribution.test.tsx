import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CourseDifficultyDistribution } from "./CourseDifficultyDistribution";

describe("CourseDifficultyDistribution component", () => {
  it("renders total count and calculates easy, medium, hard distribution accurately from questions array", () => {
    const mockQuestions = [
      { difficulty: 2 }, // Dễ (<=4)
      { difficulty: 3 }, // Dễ (<=4)
      { difficulty: 5 }, // Trung bình (==5)
      { difficulty: 7 }, // Khó (>=6)
    ];

    render(<CourseDifficultyDistribution questions={mockQuestions} />);

    // Total count
    expect(screen.getByTestId("dist-total-count")).toHaveTextContent("4");

    // Micro legend
    const legend = screen.getByTestId("dist-breakdown-legend");
    expect(legend).toHaveTextContent("2 Dễ");
    expect(legend).toHaveTextContent("1 TB");
    expect(legend).toHaveTextContent("1 Khó");

    // Segment widths: 2/4 = 50% easy, 1/4 = 25% medium, 1/4 = 25% hard
    const easyBar = screen.getByTestId("dist-bar-easy");
    const mediumBar = screen.getByTestId("dist-bar-medium");
    const hardBar = screen.getByTestId("dist-bar-hard");

    expect(easyBar.style.width).toBe("50%");
    expect(mediumBar.style.width).toBe("25%");
    expect(hardBar.style.width).toBe("25%");
  });

  it("supports explicit count props instead of questions array", () => {
    render(
      <CourseDifficultyDistribution
        total={10}
        easyCount={4}
        mediumCount={4}
        hardCount={2}
      />,
    );

    expect(screen.getByTestId("dist-total-count")).toHaveTextContent("10");

    const legend = screen.getByTestId("dist-breakdown-legend");
    expect(legend).toHaveTextContent("4 Dễ");
    expect(legend).toHaveTextContent("4 TB");
    expect(legend).toHaveTextContent("2 Khó");

    const easyBar = screen.getByTestId("dist-bar-easy");
    const mediumBar = screen.getByTestId("dist-bar-medium");
    const hardBar = screen.getByTestId("dist-bar-hard");

    expect(easyBar.style.width).toBe("40%");
    expect(mediumBar.style.width).toBe("40%");
    expect(hardBar.style.width).toBe("20%");
  });

  it("handles zero questions gracefully without crashing", () => {
    render(<CourseDifficultyDistribution questions={[]} />);

    expect(screen.getByTestId("dist-total-count")).toHaveTextContent("0");
    expect(screen.getByText("0 câu hỏi")).toBeInTheDocument();
    expect(screen.queryByTestId("dist-bar-easy")).not.toBeInTheDocument();
  });
});
