import { render, screen } from "@testing-library/react";
import type { GradeSummary } from "@/lib/contracts";
import { RecentGradesWidget } from "@/app/ui/dashboard/widgets/recent-grades-widget";

const sample: GradeSummary[] = [
  {
    id: "g1",
    moduleCode: "CS3235",
    assignmentTitle: "Homework 1",
    score: 20,
    gradeText: "20",
    pointsPossible: 25,
    state: "graded",
    gradedAt: "2026-04-19T00:00:00Z",
    gradedLabel: "yesterday",
    canvasUrl: "https://canvas.nus.edu.sg/courses/9876/assignments/42",
  },
  {
    id: "g2",
    moduleCode: "CS3235",
    assignmentTitle: "Homework 2",
    score: null,
    gradeText: null,
    pointsPossible: null,
    state: "unsubmitted",
    gradedAt: null,
    gradedLabel: "",
    canvasUrl: null,
  },
];

describe("RecentGradesWidget", () => {
  it("renders grade rows with module code, title, and score", () => {
    render(<RecentGradesWidget grades={sample} />);
    expect(screen.getByText("Homework 1")).toBeInTheDocument();
    expect(screen.getByText(/20 \/ 25/)).toBeInTheDocument();
    expect(screen.getByText(/graded/i)).toBeInTheDocument();
  });

  it("shows a state badge for unsubmitted grades without a score", () => {
    render(<RecentGradesWidget grades={sample} />);
    expect(screen.getByText("Homework 2")).toBeInTheDocument();
    expect(screen.getByText(/unsubmitted/i)).toBeInTheDocument();
  });

  it("links rows with a canvasUrl to Canvas in a new tab", () => {
    render(<RecentGradesWidget grades={sample} />);
    const link = screen.getByRole("link", { name: /Homework 1/i });
    expect(link).toHaveAttribute("href", sample[0].canvasUrl);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders empty state when no grades", () => {
    render(<RecentGradesWidget grades={[]} />);
    expect(screen.getByText(/No grades yet/i)).toBeInTheDocument();
  });
});
