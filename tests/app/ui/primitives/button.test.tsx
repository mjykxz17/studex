import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Button } from "@/app/ui/primitives/button";

describe("Button", () => {
  it("renders text and fires onClick", async () => {
    const fn = vi.fn();
    render(<Button onClick={fn}>Click me</Button>);
    await userEvent.click(screen.getByRole("button", { name: /click me/i }));
    expect(fn).toHaveBeenCalled();
  });

  it("does not fire onClick when disabled", async () => {
    const fn = vi.fn();
    render(<Button disabled onClick={fn}>Click me</Button>);
    await userEvent.click(screen.getByRole("button", { name: /click me/i }));
    expect(fn).not.toHaveBeenCalled();
  });

  it("primary variant applies accent background", () => {
    render(<Button variant="primary">Go</Button>);
    const btn = screen.getByRole("button", { name: /go/i });
    expect(btn.className).toMatch(/bg-\[var\(--color-accent\)\]/);
  });

  it("secondary variant applies bordered white background", () => {
    render(<Button variant="secondary">Go</Button>);
    const btn = screen.getByRole("button", { name: /go/i });
    expect(btn.className).toMatch(/bg-\[var\(--color-bg-primary\)\]/);
    expect(btn.className).toMatch(/border/);
  });

  it("ghost variant has no background or border", () => {
    render(<Button variant="ghost">Go</Button>);
    const btn = screen.getByRole("button", { name: /go/i });
    expect(btn.className).not.toMatch(/bg-\[/);
    expect(btn.className).not.toMatch(/border\b/);
  });

  it("renders leadingIcon", () => {
    render(<Button leadingIcon={<svg data-testid="icon" />}>Go</Button>);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("applies size sm padding", () => {
    render(<Button size="sm">x</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/text-\[11px\]/);
  });
});
