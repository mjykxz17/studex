import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CheatsheetViewer } from "@/app/ui/cheatsheet/cheatsheet-viewer";

describe("CheatsheetViewer", () => {
  it("renders markdown body", () => {
    render(
      <CheatsheetViewer
        cheatsheet={{
          id: "cs1",
          title: "CS2030 — Streams",
          markdown: "# Streams\n\nLazy vs eager [1].",
          citations: [
            { n: 1, url: "https://oracle.com", title: "Oracle Java", snippet: "...", gap_concept: "Stream" },
          ],
          status: "complete",
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: /streams/i, level: 1 })).toBeInTheDocument();
  });

  it("renders citation chips with links opening in new tab", () => {
    render(
      <CheatsheetViewer
        cheatsheet={{
          id: "cs1",
          title: "T",
          markdown: "x [1].",
          citations: [
            { n: 1, url: "https://a.com", title: "A", snippet: "s", gap_concept: "x" },
          ],
          status: "complete",
        }}
      />,
    );
    const link = screen.getByRole("link", { name: /A/ });
    expect(link).toHaveAttribute("href", "https://a.com");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows the failure reason when status is failed", () => {
    render(
      <CheatsheetViewer
        cheatsheet={{
          id: "cs1",
          title: "T",
          markdown: "",
          citations: [],
          status: "failed",
          failure_reason: "rate-limited",
        }}
      />,
    );
    expect(screen.getByText(/rate-limited/i)).toBeInTheDocument();
  });

  it("renders the title above the markdown body", () => {
    render(
      <CheatsheetViewer
        cheatsheet={{
          id: "cs1",
          title: "Hello Title",
          markdown: "# Body Heading",
          citations: [],
          status: "complete",
        }}
      />,
    );
    expect(screen.getByText("Hello Title")).toBeInTheDocument();
  });
});
