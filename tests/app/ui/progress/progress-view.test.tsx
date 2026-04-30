import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { ProgressView } from "@/app/ui/progress/progress-view";

describe("ProgressView", () => {
  it("fetches and renders bucket cards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            programId: "bcomp-isc-2024",
            programName: "BComp Information Security",
            totalMc: { current: 12, required: 160 },
            buckets: [
              {
                id: "foundation",
                name: "Computing Foundation",
                required: 32,
                current: 12,
                raw: 12,
                status: "in_progress",
                fulfilling: [
                  { code: "CS1010", mc: 4, status: "completed", bucket_override: null },
                  { code: "CS1231S", mc: 4, status: "completed", bucket_override: null },
                  { code: "CS2030", mc: 4, status: "in_progress", bucket_override: null },
                ],
                missing: 20,
                suggestions: [{ code: "CS2040C", title: "Data Structures", mc: 4 }],
              },
            ],
            blockers: ["Missing 20 MC in Computing Foundation"],
            warnings: [],
            willGraduate: false,
          }),
          { status: 200 },
        ),
      ),
    );
    render(<ProgressView />);
    await waitFor(() => {
      expect(screen.getByText("Computing Foundation")).toBeInTheDocument();
    });
    expect(screen.getByText(/12 \/ 32/)).toBeInTheDocument();
    expect(screen.getByText("CS1010")).toBeInTheDocument();
    expect(screen.getByText("CS2040C")).toBeInTheDocument();
  });

  it("shows error state on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 })),
    );
    render(<ProgressView />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });
});
