import { fireEvent, render, screen } from "@testing-library/react";
import type { AnnouncementSummary } from "@/lib/contracts";
import { RecentAnnouncementsWidget } from "@/app/ui/dashboard/widgets/recent-announcements-widget";

const sample: AnnouncementSummary[] = [
  {
    id: "a1",
    title: "Mid-semester exam",
    moduleCode: "CS3235",
    summary: "Remember to bring your student ID on the day of the exam.",
    postedLabel: "2 days ago",
    postedAt: "2026-04-18T00:00:00Z",
    importance: "normal",
  },
];

describe("RecentAnnouncementsWidget", () => {
  it("renders the announcement row with summary preview", () => {
    render(
      <RecentAnnouncementsWidget
        announcements={sample}
        seenAnnouncements={{}}
        onMarkAnnouncementSeen={() => {}}
      />,
    );
    expect(screen.getByText("Mid-semester exam")).toBeInTheDocument();
    expect(screen.getByText(/Remember to bring/)).toBeInTheDocument();
    expect(screen.getByText("CS3235")).toBeInTheDocument();
  });

  it("renders empty state when no announcements", () => {
    render(
      <RecentAnnouncementsWidget
        announcements={[]}
        seenAnnouncements={{}}
        onMarkAnnouncementSeen={() => {}}
      />,
    );
    expect(screen.getByText(/No recent announcements/i)).toBeInTheDocument();
  });

  it("toggles expansion when an announcement row is clicked", () => {
    render(
      <RecentAnnouncementsWidget
        announcements={sample}
        seenAnnouncements={{}}
        onMarkAnnouncementSeen={() => {}}
      />,
    );
    const row = screen.getByRole("button", { name: /Mid-semester exam/i });
    fireEvent.click(row);
    // The widget marks itself as expanded — summary stays; no hidden content to reveal yet, just toggle state.
    expect(row.getAttribute("aria-expanded")).toBe("true");
  });
});
