import { fireEvent, render, screen } from "@testing-library/react";
import type { CourseProgressSummary } from "@/lib/contracts";
import { CourseProgressWidget } from "@/app/ui/dashboard/widgets/course-progress-widget";

const sample: CourseProgressSummary[] = [
  {
    courseId: "c1",
    moduleCode: "CS3235",
    courseTitle: "Computer Security",
    totalModules: 3,
    currentModulePosition: 2,
    currentModuleName: "Part I: System Security",
    nextItemTitle: "1-1 Special Memory Errors",
  },
];

describe("CourseProgressWidget", () => {
  it("renders per-course progress card", () => {
    render(<CourseProgressWidget courses={sample} onOpenModule={() => {}} />);
    expect(screen.getByText("CS3235")).toBeInTheDocument();
    expect(screen.getByText(/Module 2 of 3/i)).toBeInTheDocument();
    expect(screen.getByText("Part I: System Security")).toBeInTheDocument();
    expect(screen.getByText("1-1 Special Memory Errors")).toBeInTheDocument();
  });

  it("renders empty-state card when a course has no modules synced", () => {
    render(
      <CourseProgressWidget
        courses={[
          {
            courseId: "c2",
            moduleCode: "CS2103",
            courseTitle: "Software Engineering",
            totalModules: 0,
            currentModulePosition: null,
            currentModuleName: null,
            nextItemTitle: null,
          },
        ]}
        onOpenModule={() => {}}
      />,
    );
    expect(screen.getByText("CS2103")).toBeInTheDocument();
    expect(screen.getByText(/Canvas Modules not synced yet/i)).toBeInTheDocument();
  });

  it("renders widget-level empty state when no courses", () => {
    render(<CourseProgressWidget courses={[]} onOpenModule={() => {}} />);
    expect(screen.getByText(/Canvas Modules not synced yet/i)).toBeInTheDocument();
  });

  it("calls onOpenModule when a course card is clicked", () => {
    const onOpen = vi.fn();
    render(<CourseProgressWidget courses={sample} onOpenModule={onOpen} />);
    const card = screen.getByRole("button", { name: /CS3235/i });
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith("CS3235");
  });
});
