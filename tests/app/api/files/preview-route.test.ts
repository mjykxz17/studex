import { GET } from "@/app/api/files/[fileId]/preview/route";

const maybeSingleMock = vi.fn();
const downloadCanvasFileMock = vi.fn();

vi.mock("@/lib/demo-user", () => ({
  ensureDemoUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/canvas", () => ({
  downloadCanvasFile: (...args: unknown[]) => downloadCanvasFileMock(...args),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: (...args: unknown[]) => maybeSingleMock(...args),
          })),
        })),
      })),
    })),
  })),
}));

describe("GET /api/files/[fileId]/preview", () => {
  beforeEach(() => {
    maybeSingleMock.mockReset();
    downloadCanvasFileMock.mockReset();
  });

  it("streams an inline preview for a synced Canvas file", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { id: "file-row-1", canvas_file_id: "canvas-123", filename: "Week-4.pdf" },
      error: null,
    });
    downloadCanvasFileMock.mockResolvedValue({
      downloadUrl: "https://canvas.example/file.pdf",
      response: new Response("pdf-body", {
        headers: {
          "content-type": "application/pdf",
          "content-length": "8",
        },
      }),
    });

    const response = await GET(new Request("http://localhost/api/files/file-row-1/preview"), {
      params: Promise.resolve({ fileId: "file-row-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("inline;");
    expect(await response.text()).toBe("pdf-body");
  });

  it("returns 404 when the file row is missing", async () => {
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: null,
    });

    const response = await GET(new Request("http://localhost/api/files/missing/preview"), {
      params: Promise.resolve({ fileId: "missing" }),
    });

    expect(response.status).toBe(404);
  });
});
