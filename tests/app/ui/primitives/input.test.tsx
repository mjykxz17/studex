import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Input, Select } from "@/app/ui/primitives/input";

describe("Input", () => {
  it("fires onChange when typed into", async () => {
    const fn = vi.fn();
    render(<Input value="" onChange={(e) => fn(e.target.value)} placeholder="search" />);
    await userEvent.type(screen.getByPlaceholderText("search"), "hi");
    expect(fn).toHaveBeenCalled();
  });

  it("respects disabled", async () => {
    const fn = vi.fn();
    render(<Input value="" disabled onChange={(e) => fn(e.target.value)} placeholder="x" />);
    const el = screen.getByPlaceholderText("x") as HTMLInputElement;
    expect(el.disabled).toBe(true);
  });

  it("applies focus-ring class", () => {
    render(<Input value="" onChange={() => {}} placeholder="x" />);
    const el = screen.getByPlaceholderText("x") as HTMLInputElement;
    expect(el.className).toMatch(/focus:shadow-\[var\(--shadow-focus\)\]/);
  });
});

describe("Select", () => {
  it("fires onChange when option picked", async () => {
    const fn = vi.fn();
    render(
      <Select value="a" onChange={(e) => fn(e.target.value)}>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    await userEvent.selectOptions(screen.getByRole("combobox"), "b");
    expect(fn).toHaveBeenCalledWith("b");
  });
});
