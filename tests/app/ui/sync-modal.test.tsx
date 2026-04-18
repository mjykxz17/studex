import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SyncModal } from "@/app/ui/sync-modal";

import { createSseResponse } from "@/tests/helpers/stream";

describe("SyncModal", () => {
  it("loads modules after discovery and confirms selected modules", async () => {
    const onConfirm = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createSseResponse([{ status: "complete", stage: "discovery", message: "Discovery complete." }]),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            modules: [
              { id: "mod-1", code: "CS3235", title: "Computer Security", sync_enabled: true },
              { id: "mod-2", code: "IS4233", title: "IT Law", sync_enabled: false },
            ],
          }),
          { status: 200 },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    render(<SyncModal isOpen={true} onClose={() => undefined} onConfirm={onConfirm} />);

    await waitFor(() => expect(screen.getByText("Computer Security")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Select all"));
    fireEvent.click(screen.getByRole("button", { name: "Start sync" }));

    expect(onConfirm).toHaveBeenCalledWith({
      selectedModuleIds: ["mod-1", "mod-2"],
      syncFiles: true,
    });
  });

  it("filters the discovered module list and closes on escape", async () => {
    const onClose = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createSseResponse([{ status: "complete", stage: "discovery", message: "Discovery complete." }]),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            modules: [
              { id: "mod-1", code: "CS3235", title: "Computer Security", sync_enabled: true },
              { id: "mod-2", code: "IS4233", title: "IT Law", sync_enabled: false },
            ],
          }),
          { status: 200 },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    render(<SyncModal isOpen={true} onClose={onClose} onConfirm={() => undefined} />);

    expect(await screen.findByText("Computer Security")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Filter by module code or title"), {
      target: { value: "it law" },
    });

    await waitFor(() => expect(screen.getByText("IT Law")).toBeInTheDocument());
    expect(screen.queryByText("Computer Security")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
