import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dialog } from "@/app/ui/primitives/dialog";

describe("Dialog", () => {
  it("renders nothing when open is false", () => {
    render(
      <Dialog open={false} onClose={() => {}} title="X">
        <p>body</p>
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders title, eyebrow, body when open", () => {
    render(
      <Dialog open onClose={() => {}} title="Hello" eyebrow="EYE">
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("EYE")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("close button fires onClose", async () => {
    const fn = vi.fn();
    render(
      <Dialog open onClose={fn} title="X">
        <p>body</p>
      </Dialog>,
    );
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(fn).toHaveBeenCalled();
  });

  it("backdrop mousedown fires onClose", () => {
    const fn = vi.fn();
    render(
      <Dialog open onClose={fn} title="X">
        <p>body</p>
      </Dialog>,
    );
    const backdrop = document.querySelector('[data-testid="dialog-backdrop"]') as HTMLElement;
    backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(fn).toHaveBeenCalled();
  });

  it("size prop maps to max-w class", () => {
    const { rerender } = render(
      <Dialog open onClose={() => {}} title="X" size="sm">
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByRole("dialog").className).toMatch(/max-w-sm/);
    rerender(
      <Dialog open onClose={() => {}} title="X" size="xl">
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByRole("dialog").className).toMatch(/max-w-5xl/);
  });
});
