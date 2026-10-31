import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getExams: vi.fn(),
  getMyCourses: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api", () => ({
  default: {
    getExams: mocks.getExams,
    getMyCourses: mocks.getMyCourses,
  },
  unwrapPaginatedData: (data: unknown) => data,
}));

vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/admin/AdminPageShell", () => ({
  AdminPageShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/admin/AdminStatCard", () => ({
  AdminStatCard: ({ label, value }: { label: string; value: number }) => <div>{label}: {value}</div>,
}));
vi.mock("@/components/common/list/ListPageHeader", () => ({
  ListPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/common/list/SearchBar", () => ({ SearchBar: () => null }));
vi.mock("@/components/common/list/FilterPanel", () => ({ FilterPanel: () => null }));
vi.mock("@/components/common/list/SortButton", () => ({ SortButton: () => null }));
vi.mock("@/components/common/list/ActiveFilterChips", () => ({ ActiveFilterChips: () => null }));
vi.mock("@/components/ui/status-badge", () => ({ StatusBadge: () => <span>Status</span> }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogDescription: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogFooter: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogHeader: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogTitle: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/common/DataPagination", () => ({
  DataPagination: ({ currentPage, totalPages, onPageChange }: { currentPage: number; totalPages: number; onPageChange: (page: number) => void }) => (
    <div data-testid="pagination">
      Trang {currentPage} / {totalPages}
      <button type="button" onClick={() => onPageChange(currentPage + 1)}>Trang sau</button>
    </div>
  ),
}));

import ExamManagement from "./ExamManagement";

const makeExam = (index: number) => ({
  id: `exam-${index}`,
  title: `Exam ${index}`,
  course: { id: "course-1", code: "CS101", name: "Computer Science" },
  status: "DRAFT" as const,
  duration: 45,
  createdAt: new Date(2030, 0, 16 - index).toISOString(),
  _count: { examQuestions: 0, submissions: 0 },
});

describe("ExamManagement client-side pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getExams.mockResolvedValue(Array.from({ length: 15 }, (_, index) => makeExam(index + 1)));
    mocks.getMyCourses.mockResolvedValue([]);
  });

  it("shows 15 exams on three UI pages and does not request a second backend page", async () => {
    render(<ExamManagement />);

    await waitFor(() => expect(screen.getByText("Exam 1")).toBeInTheDocument());
    expect(screen.getByTestId("pagination")).toHaveTextContent("Trang 1 / 3");
    expect(mocks.getExams).toHaveBeenCalledTimes(1);
    expect(mocks.getExams).toHaveBeenCalledWith({ includeArchived: true, page: 1, limit: 500 });

    fireEvent.click(screen.getByRole("button", { name: "Trang sau" }));

    await waitFor(() => expect(screen.getByText("Exam 6")).toBeInTheDocument());
    expect(screen.getByText("Exam 10")).toBeInTheDocument();
    expect(screen.queryByText("Exam 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Exam 11")).not.toBeInTheDocument();
    expect(screen.getByTestId("pagination")).toHaveTextContent("Trang 2 / 3");
    expect(mocks.getExams).toHaveBeenCalledTimes(1);
    expect(mocks.getExams).not.toHaveBeenCalledWith(expect.objectContaining({ page: 2, limit: 500 }));
  });
});
