import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Card } from "@/app/ui/primitives/card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card><span>content</span></Card>);
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("applies hover-lift class when hoverLift is true", () => {
    const { container } = render(<Card hoverLift><span>x</span></Card>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/motion-hover/);
    expect(root.className).toMatch(/hover:shadow-\[var\(--shadow-lift\)\]/);
  });

  it("applies inset (tighter padding) when inset is true", () => {
    const { container } = render(<Card inset><span>x</span></Card>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/px-3/);
  });

  it("uses default padding when neither prop is set", () => {
    const { container } = render(<Card><span>x</span></Card>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toMatch(/motion-hover/);
    expect(root.className).toMatch(/px-\[var\(--space-card-x\)\]/);
  });
});
