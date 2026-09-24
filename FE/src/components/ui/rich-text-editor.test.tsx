import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { RichTextEditor } from "./rich-text-editor";
import { FormattedText } from "./formatted-text";

describe("RichTextEditor", () => {
  it("renders formatting toolbar buttons", () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="test content" onChange={onChange} />);

    expect(screen.getByRole("button", { name: /chữ đậm/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /chữ nghiêng/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /gạch chân/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /gạch ngang/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /xóa định dạng/i })).toBeInTheDocument();
  });

  it("updates value on change in textarea", () => {
    const onChange = vi.fn();
    render(<RichTextEditor value="" onChange={onChange} />);

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Hello world" } });

    expect(onChange).toHaveBeenCalledWith("Hello world");
  });

  it("inserts bold formatting when B button is clicked", () => {
    let currentVal = "sample";
    const onChange = vi.fn((val) => {
      currentVal = val;
    });

    render(<RichTextEditor value={currentVal} onChange={onChange} />);

    const boldBtn = screen.getByRole("button", { name: /chữ đậm/i });
    fireEvent.click(boldBtn);

    expect(onChange).toHaveBeenCalled();
  });
});

describe("FormattedText", () => {
  it("renders plain text without markup", () => {
    const { container } = render(<FormattedText text="Đơn giản" />);
    expect(container).toHaveTextContent("Đơn giản");
  });

  it("renders bold, italic, underline, strikethrough correctly", () => {
    const { container } = render(
      <FormattedText text="Đây là **đậm**, *nghiêng*, <u>gạch chân</u>, ~~gạch ngang~~" />
    );

    expect(container.querySelector("strong")).toHaveTextContent("đậm");
    expect(container.querySelector("em")).toHaveTextContent("nghiêng");
    expect(container.querySelector(".underline")).toHaveTextContent("gạch chân");
    expect(container.querySelector("del")).toHaveTextContent("gạch ngang");
  });

  it("renders lists and blockquotes correctly", () => {
    const { container } = render(
      <FormattedText text={`> trích dẫn\n- mục 1\n- mục 2`} />
    );

    expect(container.querySelector("blockquote")).toHaveTextContent("trích dẫn");
    expect(container.querySelector("ul")).toBeInTheDocument();
    const items = container.querySelectorAll("li");
    expect(items.length).toBe(2);
    expect(items[0]).toHaveTextContent("mục 1");
  });
});
