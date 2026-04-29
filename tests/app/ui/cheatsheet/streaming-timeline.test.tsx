import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { StreamingTimeline } from "@/app/ui/cheatsheet/streaming-timeline";

describe("StreamingTimeline", () => {
  it("renders each stage event as a row", () => {
    render(
      <StreamingTimeline
        events={[
          { type: "stage-start", stage: "ingest", message: "Parsing 2 files…" },
          { type: "stage-complete", stage: "ingest", data: { parsed: 2, skipped: 0 } },
          { type: "stage-start", stage: "detect-gaps", message: "Identifying gap concepts…" },
          { type: "warning", message: "Skipped scan.pdf: no text layer" },
        ]}
        finished={false}
      />,
    );
    expect(screen.getByText(/parsing 2 files/i)).toBeInTheDocument();
    expect(screen.getByText(/identifying gap concepts/i)).toBeInTheDocument();
    expect(screen.getByText(/scan\.pdf/i)).toBeInTheDocument();
  });

  it("shows a 'done' indicator when finished is true", () => {
    render(
      <StreamingTimeline
        events={[{ type: "complete", cheatsheet_id: "cs1" }]}
        finished
      />,
    );
    expect(screen.getByText(/done|complete/i)).toBeInTheDocument();
  });

  it("renders failure events distinctly", () => {
    render(
      <StreamingTimeline
        events={[{ type: "failed", reason: "rate-limited" }]}
        finished
      />,
    );
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
    expect(screen.getByText(/rate-limited/i)).toBeInTheDocument();
  });
});
