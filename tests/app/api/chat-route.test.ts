import { POST } from "@/app/api/chat/route";

vi.mock("@/lib/demo-user", () => ({
  ensureDemoUser: vi.fn(async () => ({ id: "user-1", ai_model: "claude-haiku-4-5" })),
}));

vi.mock("@/lib/embed", () => ({
  generateEmbedding: vi.fn(async () => [0.1, 0.2, 0.3]),
}));

const rpcMock = vi.fn();

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: vi.fn(() => ({
    rpc: rpcMock,
  })),
}));

const callAITextMock = vi.fn();

vi.mock("@/lib/ai", () => ({
  callAIText: (...args: unknown[]) => callAITextMock(...args),
}));

describe("POST /api/chat", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    callAITextMock.mockReset();
  });

  it("returns a no-context answer when retrieval finds nothing relevant", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "What is due next?" }),
      }),
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.sources).toEqual([]);
    expect(payload.answer).toContain("couldn’t find relevant synced material");
  });

  it("returns labeled sources for grounded answers", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          id: "chunk-1",
          source_id: "file-1",
          chunk_text: "Exam format is open book.",
          source_type: "file",
          source_label: "CS3235 · file · Week 4 Slides.pdf",
          module_code: "CS3235",
          similarity: 0.82,
        },
      ],
      error: null,
    });
    callAITextMock.mockResolvedValue("The exam is open book (CS3235 · file · Week 4 Slides.pdf).");

    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: "What is the exam format?" }),
      }),
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.sources[0]).toMatchObject({
      label: "CS3235 · file · Week 4 Slides.pdf",
      moduleCode: "CS3235",
      sourceType: "file",
    });
  });
});
