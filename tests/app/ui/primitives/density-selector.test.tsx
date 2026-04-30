import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DensitySelector } from "@/app/ui/primitives/density-selector";

describe("DensitySelector", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-density");
  });
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-density");
  });

  it("defaults to comfortable when localStorage empty", () => {
    render(<DensitySelector />);
    const btn = screen.getByRole("button", { name: /comfortable/i });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("reads localStorage value on mount", () => {
    localStorage.setItem("studex.density", "spacious");
    render(<DensitySelector />);
    const btn = screen.getByRole("button", { name: /spacious/i });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking a pill updates localStorage AND <html data-density>", async () => {
    render(<DensitySelector />);
    await userEvent.click(screen.getByRole("button", { name: /compact/i }));
    expect(localStorage.getItem("studex.density")).toBe("compact");
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
  });
});
