import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import { CheatsheetPanel } from "@/app/ui/cheatsheet/cheatsheet-panel";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CheatsheetPanel", () => {
  it("fetches and lists cheatsheets for the course", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          cheatsheets: [
            {
              id: "cs1",
              title: "Streams Cheatsheet",
              status: "complete",
              created_at: "2026-04-30T00:00:00Z",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CheatsheetPanel courseId="c1" files={[]} />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /streams cheatsheet/i })).toBeInTheDocument();
    });
    const link = screen.getByRole("link", { name: /streams cheatsheet/i });
    expect(link).toHaveAttribute("href", "/cheatsheets/cs1");
    expect(fetchMock).toHaveBeenCalledWith("/api/cheatsheets?course_id=c1");
  });

  it("renders empty state when no cheatsheets exist", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ cheatsheets: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CheatsheetPanel courseId="c1" files={[]} />);

    await waitFor(() => {
      expect(screen.getByText(/no cheatsheets yet/i)).toBeInTheDocument();
    });
  });

  it("opens the generate modal when the button is clicked", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ cheatsheets: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CheatsheetPanel courseId="c1" files={[]} />);
    await waitFor(() => screen.getByRole("button", { name: /generate cheatsheet/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /generate cheatsheet/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("links generating cheatsheets to the generating page (not the viewer)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          cheatsheets: [
            { id: "cs2", title: "In progress", status: "streaming", created_at: "2026-04-30T00:00:00Z" },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CheatsheetPanel courseId="c1" files={[]} />);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /in progress/i })).toBeInTheDocument();
    });
    const link = screen.getByRole("link", { name: /in progress/i });
    expect(link).toHaveAttribute("href", "/cheatsheets/cs2/generating");
  });
});
