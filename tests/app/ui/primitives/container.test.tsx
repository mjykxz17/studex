import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Container } from "@/app/ui/primitives/container";

describe("Container", () => {
  it("renders children", () => {
    render(<Container><div data-testid="child">hi</div></Container>);
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("applies max-width and mx-auto classes", () => {
    const { container } = render(<Container><span>x</span></Container>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/max-w-\[1200px\]/);
    expect(root.className).toMatch(/mx-auto/);
  });
});
