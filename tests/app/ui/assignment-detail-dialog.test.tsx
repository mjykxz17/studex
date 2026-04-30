import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AssignmentDetailDialog } from "@/app/ui/assignment-detail-dialog";

describe("AssignmentDetailDialog", () => {
  it("fetches and renders description on open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "t1",
            title: "Lab 1: Buffer overflow",
            dueAt: "2026-05-01T23:59:00Z",
            descriptionHtml: "<p>Submit by Friday</p>",
          }),
          { status: 200 },
        ),
      ),
    );

    render(<AssignmentDetailDialog taskId="t1" title="Lab 1" moduleCode="CS3235" />);
    await userEvent.click(screen.getByRole("button", { name: /details/i }));
    await waitFor(() => {
      expect(screen.getByText("Submit by Friday")).toBeInTheDocument();
    });
  });
});
