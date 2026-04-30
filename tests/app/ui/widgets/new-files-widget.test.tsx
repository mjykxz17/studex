import { render, screen } from "@testing-library/react";
import type { CanvasFileSummary } from "@/lib/contracts";
import { NewFilesWidget } from "@/app/ui/dashboard/widgets/new-files-widget";

type NewFile = CanvasFileSummary & { moduleCode: string; moduleTitle: string };

const sample: NewFile[] = [
  {
    id: "f1",
    name: "lecture-01.pdf",
    type: "lecture",
    category: "lecture",
    uploadedLabel: "today",
    uploadedAt: "2026-04-20T00:00:00Z",
    summary: "Week 1 introduction",
    canvasUrl: "https://canvas.nus.edu.sg/...",
    canvasFileId: null,
    extractedText: null,
    previewKind: "pdf",
    contentType: "application/pdf",
    moduleCode: "CS3235",
    moduleTitle: "Computer Security",
  },
];

describe("NewFilesWidget", () => {
  it("renders the file card with filename + module code", () => {
    render(<NewFilesWidget files={sample} onOpenModule={() => {}} />);
    expect(screen.getByText("lecture-01.pdf")).toBeInTheDocument();
    expect(screen.getByText("CS3235")).toBeInTheDocument();
  });

  it("renders empty state when no files", () => {
    render(<NewFilesWidget files={[]} onOpenModule={() => {}} />);
    expect(screen.getByText(/No new files this week/i)).toBeInTheDocument();
  });
});
