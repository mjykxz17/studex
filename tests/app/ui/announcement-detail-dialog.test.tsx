import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnnouncementDetailDialog } from "@/app/ui/announcement-detail-dialog";

const a = {
  id: "a1",
  title: "Tutorial 5 rescheduled",
  moduleCode: "CS3235",
  summary: "Moved to Friday",
  bodyHtml: "<p>Tutorial 5 has been moved to <strong>Friday</strong>.</p>",
  postedLabel: "today",
  postedAt: "2026-04-30T00:00:00Z",
  importance: "normal" as const,
};

describe("AnnouncementDetailDialog", () => {
  it("renders the sanitized body when opened", async () => {
    render(<AnnouncementDetailDialog announcement={a} />);
    await userEvent.click(screen.getByRole("button", { name: /read full/i }));
    expect(screen.getByText("Friday")).toBeInTheDocument();
  });
});
