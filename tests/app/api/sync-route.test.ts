import { GET, POST } from "@/app/api/sync/route";

const discoveryMock = vi.fn();
const syncMock = vi.fn();

vi.mock("@/lib/sync", () => ({
  runDiscoverySync: (...args: unknown[]) => discoveryMock(...args),
  runSelectedModuleSync: (...args: unknown[]) => syncMock(...args),
}));

async function readResponseText(response: Response) {
  return await response.text();
}

describe("/api/sync route", () => {
  beforeEach(() => {
    discoveryMock.mockReset();
    syncMock.mockReset();
  });

  it("streams discovery events", async () => {
    discoveryMock.mockImplementation(async (send: (event: unknown) => void) => {
      send({ status: "complete", stage: "discovery", message: "done" });
    });

    const response = await GET();
    expect(await readResponseText(response)).toContain('"stage":"discovery"');
  });

  it("streams sync errors in SSE form", async () => {
    syncMock.mockRejectedValue(new Error("boom"));

    const response = await POST(
      new Request("http://localhost/api/sync", {
        method: "POST",
        body: JSON.stringify({ selectedModuleIds: ["mod-1"], syncFiles: true }),
      }),
    );

    expect(await readResponseText(response)).toContain('"status":"error"');
  });
});
