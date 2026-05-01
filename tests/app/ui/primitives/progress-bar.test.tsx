import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { ProgressBar } from "@/app/ui/primitives/progress-bar";

describe("ProgressBar", () => {
  it("renders with success tone applying success token", () => {
    const { container } = render(<ProgressBar value={50} tone="success" />);
    const fill = container.querySelector('[data-testid="progress-fill"]') as HTMLElement;
    expect(fill).toBeTruthy();
    expect(fill.className).toMatch(/bg-\[var\(--color-success\)\]/);
    expect(fill.style.width).toBe("50%");
  });

  it("clamps value above 100 to 100", () => {
    const { container } = render(<ProgressBar value={150} tone="warn" />);
    const fill = container.querySelector('[data-testid="progress-fill"]') as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });

  it("clamps value below 0 to 0", () => {
    const { container } = render(<ProgressBar value={-10} tone="tertiary" />);
    const fill = container.querySelector('[data-testid="progress-fill"]') as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });

  it("warn tone applies warn token", () => {
    const { container } = render(<ProgressBar value={50} tone="warn" />);
    const fill = container.querySelector('[data-testid="progress-fill"]') as HTMLElement;
    expect(fill.className).toMatch(/bg-\[var\(--color-warn\)\]/);
  });

  it("tertiary tone applies fg-tertiary token (for not-started)", () => {
    const { container } = render(<ProgressBar value={50} tone="tertiary" />);
    const fill = container.querySelector('[data-testid="progress-fill"]') as HTMLElement;
    expect(fill.className).toMatch(/bg-\[var\(--color-fg-tertiary\)\]/);
  });

  it("accent tone applies accent token", () => {
    const { container } = render(<ProgressBar value={50} tone="accent" />);
    const fill = container.querySelector('[data-testid="progress-fill"]') as HTMLElement;
    expect(fill.className).toMatch(/bg-\[var\(--color-accent\)\]/);
  });
});
