import { render, screen } from "@testing-library/react";
import { StatsHeader } from "@/app/ui/dashboard/widgets/stats-header";

describe("StatsHeader", () => {
  it("renders the three numeric stats and accent colors", () => {
    render(<StatsHeader dueSoonCount={3} openTaskCount={12} unreadAnnouncementCount={5} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText(/Due soon/i)).toBeInTheDocument();
    expect(screen.getByText(/Open tasks/i)).toBeInTheDocument();
    expect(screen.getByText(/Changes/i)).toBeInTheDocument();
  });

  it("renders a zero state when counts are 0", () => {
    render(<StatsHeader dueSoonCount={0} openTaskCount={0} unreadAnnouncementCount={0} />);
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBe(3);
  });
});
