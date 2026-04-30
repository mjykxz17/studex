import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PageViewerDialog } from "@/app/ui/page-viewer-dialog";

describe("PageViewerDialog", () => {
  it("fetches and renders the page body when opened", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ id: "p1", title: "Week 1 Notes", bodyHtml: "<p>Hello world</p>" }),
          { status: 200 },
        ),
      ),
    );

    render(<PageViewerDialog page={{ id: "p1", pageUrl: "week-1", title: "Week 1 Notes", updatedAt: null, updatedLabel: "—" }} moduleCode="CS3235" />);
    await userEvent.click(screen.getByRole("button", { name: /open/i }));

    await waitFor(() => {
      expect(screen.getByText("Hello world")).toBeInTheDocument();
    });
  });

  it("shows error state when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 })),
    );

    render(<PageViewerDialog page={{ id: "p1", pageUrl: "week-1", title: "Week 1", updatedAt: null, updatedLabel: "—" }} moduleCode="CS3235" />);
    await userEvent.click(screen.getByRole("button", { name: /open/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });
});
