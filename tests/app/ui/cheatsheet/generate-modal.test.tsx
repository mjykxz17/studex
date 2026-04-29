import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { GenerateModal } from "@/app/ui/cheatsheet/generate-modal";

const files = [
  { id: "f1", filename: "lecture-1.pdf", week_number: 1, uploaded_at: "2026-04-10" },
  { id: "f2", filename: "lecture-2.pdf", week_number: 2, uploaded_at: "2026-04-17" },
];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GenerateModal", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(
      <GenerateModal open={false} onClose={() => {}} courseId="c1" files={files} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("disables submit when no files are selected", () => {
    render(<GenerateModal open onClose={() => {}} courseId="c1" files={files} />);
    expect(screen.getByRole("button", { name: /generate/i })).toBeDisabled();
  });

  it("enables submit when at least one file is selected", () => {
    render(<GenerateModal open onClose={() => {}} courseId="c1" files={files} />);
    fireEvent.click(screen.getByLabelText(/lecture-1\.pdf/i));
    expect(screen.getByRole("button", { name: /generate/i })).toBeEnabled();
  });

  it("posts to /api/cheatsheets/generate with selected ids on submit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(`data: ${JSON.stringify({ type: "complete", cheatsheet_id: "cs9" })}\n\n`, {
        status: 200,
        headers: {
          "x-cheatsheet-id": "cs9",
          "content-type": "text/event-stream",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    render(<GenerateModal open onClose={onClose} courseId="c1" files={files} />);
    fireEvent.click(screen.getByLabelText(/lecture-1\.pdf/i));
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/cheatsheets/generate",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({
      course_id: "c1",
      source_file_ids: ["f1"],
    });
  });
});
