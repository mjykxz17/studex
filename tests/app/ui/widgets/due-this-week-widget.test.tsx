import { render, screen } from "@testing-library/react";
import type { WeeklyTask } from "@/lib/contracts";
import { DueThisWeekWidget } from "@/app/ui/dashboard/widgets/due-this-week-widget";

const sampleTasks: WeeklyTask[] = [
  {
    id: "t1",
    title: "Assignment 1",
    moduleCode: "CS3235",
    dueLabel: "in 3 days",
    dueDate: "2026-04-25T00:00:00Z",
    status: "due-soon",
    source: "canvas",
  },
  {
    id: "t2",
    title: "Read Chapter 5",
    moduleCode: "CS2103",
    dueLabel: "in 5 days",
    dueDate: "2026-04-27T00:00:00Z",
    status: "upcoming",
    source: "canvas",
  },
];

describe("DueThisWeekWidget", () => {
  it("renders the task rows with module code and title", () => {
    render(<DueThisWeekWidget tasks={sampleTasks} />);
    expect(screen.getByText("Assignment 1")).toBeInTheDocument();
    expect(screen.getByText("CS3235")).toBeInTheDocument();
    expect(screen.getByText("Read Chapter 5")).toBeInTheDocument();
    expect(screen.getByText("CS2103")).toBeInTheDocument();
  });

  it("renders empty state when no tasks", () => {
    render(<DueThisWeekWidget tasks={[]} />);
    expect(screen.getByText(/Nothing due this week/i)).toBeInTheDocument();
  });
});
