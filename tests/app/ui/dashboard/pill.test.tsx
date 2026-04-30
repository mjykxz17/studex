import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Pill } from "@/app/ui/dashboard/shared";

describe("Pill", () => {
  it("default (neutral) tone applies neutral class", () => {
    render(<Pill>x</Pill>);
    expect(screen.getByText("x").className).toMatch(/bg-\[var\(--color-bg-secondary\)\]/);
  });

  it("accent tone applies accent class", () => {
    render(<Pill tone="accent">x</Pill>);
    expect(screen.getByText("x").className).toMatch(/text-\[var\(--color-accent\)\]/);
  });

  it("success tone uses success token color", () => {
    render(<Pill tone="success">x</Pill>);
    expect(screen.getByText("x").className).toMatch(/text-\[var\(--color-success\)\]/);
  });

  it("legacy 'blue' alias keeps working", () => {
    render(<Pill tone="blue">x</Pill>);
    expect(screen.getByText("x").className).toMatch(/text-\[var\(--color-accent\)\]/);
  });

  it("legacy 'rose' alias keeps working", () => {
    render(<Pill tone="rose">x</Pill>);
    expect(screen.getByText("x").className).toMatch(/text-\[var\(--color-danger\)\]/);
  });

  it("legacy 'slate' alias keeps working", () => {
    render(<Pill tone="slate">x</Pill>);
    expect(screen.getByText("x").className).toMatch(/bg-\[var\(--color-bg-secondary\)\]/);
  });
});
