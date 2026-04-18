import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SyncButton } from "@/app/ui/sync-button";
import { createSseResponse } from "@/tests/helpers/stream";

const { refresh } = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh,
  }),
}));

vi.mock("@/app/ui/sync-modal", () => ({
  SyncModal: ({
    isOpen,
    onConfirm,
  }: {
    isOpen: boolean;
    onConfirm: (config: { selectedModuleIds: string[]; syncFiles: boolean }) => void;
  }) =>
    isOpen ? (
      <button type="button" onClick={() => onConfirm({ selectedModuleIds: ["module-1"], syncFiles: true })}>
        Confirm sync
      </button>
    ) : null,
}));

describe("SyncButton", () => {
  afterEach(() => {
    refresh.mockReset();
    vi.unstubAllGlobals();
  });

  it("clears sync status text when fresh sync metadata arrives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createSseResponse([
          { status: "progress", stage: "module", message: "Syncing CS3235…" },
          { status: "complete", stage: "finalizing", message: "Done." },
        ]),
      ),
    );

    const { rerender } = render(<SyncButton initialLastSyncedAt={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Sync Canvas" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm sync" }));

    expect(await screen.findByText("Sync complete. Refreshing workspace…")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);

    rerender(<SyncButton initialLastSyncedAt="2026-03-14T10:00:00.000Z" />);

    await waitFor(() => expect(screen.getByText(/Last sync/i)).toBeInTheDocument());
    expect(screen.queryByText("Sync complete. Refreshing workspace…")).not.toBeInTheDocument();
  });
});
