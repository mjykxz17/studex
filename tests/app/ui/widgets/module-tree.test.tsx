import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ModuleTree } from "@/app/ui/dashboard/widgets/module-tree";

describe("ModuleTree", () => {
  const sample = {
    moduleCode: "CS3235",
    courseModules: [
      {
        id: "m1",
        name: "Week 1",
        position: 1,
        state: "active",
        itemsCount: 2,
        items: [
          {
            id: "i1",
            title: "Welcome",
            itemType: "SubHeader",
            position: 1,
            contentRef: null,
            externalUrl: null,
            indent: 0,
          },
          {
            id: "i2",
            title: "Lecture 1 slides",
            itemType: "File",
            position: 2,
            contentRef: "canvas-file-1",
            externalUrl: null,
            indent: 0,
          },
        ],
      },
    ],
    pages: [],
    files: [
      {
        id: "local-f1",
        canvasFileId: "canvas-file-1",
        name: "lecture-1.pdf",
        type: "lecture",
        category: "lecture",
        uploadedLabel: "today",
        uploadedAt: null,
        summary: "",
        canvasUrl: null,
        extractedText: null,
        previewKind: "pdf" as const,
        contentType: null,
      },
    ],
    tasks: [],
  };

  it("renders module names and items", () => {
    render(<ModuleTree {...sample} />);
    expect(screen.getByText("Week 1")).toBeInTheDocument();
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("Lecture 1 slides")).toBeInTheDocument();
  });

  it("renders empty state when no modules", () => {
    render(<ModuleTree moduleCode="CS3235" courseModules={[]} pages={[]} files={[]} tasks={[]} />);
    expect(screen.getByText(/no canvas modules/i)).toBeInTheDocument();
  });
});
