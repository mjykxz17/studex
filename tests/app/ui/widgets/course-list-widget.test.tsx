import { render, screen } from "@testing-library/react";
import type { ModuleSummary } from "@/lib/contracts";
import { CourseListWidget } from "@/app/ui/dashboard/widgets/course-list-widget";

const sample: ModuleSummary[] = [
  {
    id: "m1",
    code: "CS3235",
    title: "Computer Security",
    taskCount: 2,
    announcementCount: 3,
    lastSyncLabel: "today",
    sync_enabled: true,
    files: [],
    nextTask: null,
    latestAnnouncement: null,
    recentFile: null,
    examSummary: null,
    nusmods: null,
    pages: [],
    courseModules: [],
  },
];

describe("CourseListWidget", () => {
  it("renders each module card", () => {
    render(<CourseListWidget modules={sample} onOpenModule={() => {}} />);
    expect(screen.getByText("CS3235")).toBeInTheDocument();
    expect(screen.getByText("Computer Security")).toBeInTheDocument();
    expect(screen.getByText("2 tasks")).toBeInTheDocument();
  });

  it("renders empty state when no modules", () => {
    render(<CourseListWidget modules={[]} onOpenModule={() => {}} />);
    expect(screen.getByText(/No courses yet/i)).toBeInTheDocument();
  });
});
