import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GuardrailAlertBanner, GuardrailResult } from "./GuardrailAlertBanner";

describe("GuardrailAlertBanner", () => {
  it("renders nothing when guardrailResult is null", () => {
    const { container } = render(<GuardrailAlertBanner guardrailResult={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when guardrailBlocked is false", () => {
    const result: GuardrailResult = {
      guardrailBlocked: false,
      offendingKeywords: [],
    };
    const { container } = render(<GuardrailAlertBanner guardrailResult={result} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders guardrail alert with offending keywords and course details", () => {
    const result: GuardrailResult = {
      guardrailBlocked: true,
      offendingKeywords: ["đồ ăn", "thực phẩm"],
      courseDomain: "Công nghệ thông tin / Khoa học máy tính",
      detectedDomain: "Ẩm thực / Dinh dưỡng",
      reason: "Yêu cầu lạc đề so với học phần CNTT.",
      suggestion: "Hãy chỉ định ngữ cảnh lập trình hoặc bài toán CNTT cụ thể.",
    };

    render(<GuardrailAlertBanner guardrailResult={result} courseName="Nhập môn CNTT" />);

    expect(screen.getByTestId("guardrail-alert-banner")).toBeInTheDocument();
    expect(screen.getByText("Cơ chế Topic Guardrails đã từ chối yêu cầu")).toBeInTheDocument();
    expect(screen.getByText("Nhập môn CNTT")).toBeInTheDocument();
    expect(screen.getByText("Ẩm thực / Dinh dưỡng")).toBeInTheDocument();
    expect(screen.getByText("đồ ăn")).toBeInTheDocument();
    expect(screen.getByText("thực phẩm")).toBeInTheDocument();
    expect(screen.getByText("Yêu cầu lạc đề so với học phần CNTT.")).toBeInTheDocument();
    expect(screen.getByText(/Hãy chỉ định ngữ cảnh lập trình/)).toBeInTheDocument();
  });

  it("calls onDismiss when close button is clicked", () => {
    const onDismiss = vi.fn();
    const result: GuardrailResult = {
      guardrailBlocked: true,
      offendingKeywords: ["mỹ phẩm"],
    };

    render(<GuardrailAlertBanner guardrailResult={result} onDismiss={onDismiss} />);

    const closeBtn = screen.getByRole("button", { name: "Đóng cảnh báo Guardrails" });
    fireEvent.click(closeBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
