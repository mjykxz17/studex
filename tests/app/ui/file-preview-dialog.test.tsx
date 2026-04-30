import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { FilePreviewDialog } from "@/app/ui/file-preview-dialog";

const previewableFile = {
  id: "file-1",
  name: "lecture-01.pdf",
  type: "lecture",
  category: "lecture",
  uploadedLabel: "Today",
  uploadedAt: "2026-03-13T13:30:00.000Z",
  summary: "- Week 1 notes",
  canvasUrl: "https://canvas.example/files/1",
  canvasFileId: null,
  extractedText: "Week 1 notes",
  previewKind: "pdf" as const,
  contentType: "application/pdf",
};

describe("FilePreviewDialog", () => {
  it("opens as a dialog, locks scroll, and closes on escape", async () => {
    render(<FilePreviewDialog file={previewableFile} moduleCode="CS3235" />);

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe("");
  });
});
