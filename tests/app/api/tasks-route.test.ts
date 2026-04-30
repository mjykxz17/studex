import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMaybeSingle = vi.fn();
const mockEq2 = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockEq1 = vi.fn(() => ({ eq: mockEq2 }));
const mockSelect = vi.fn(() => ({ eq: mockEq1 }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: () => ({ from: mockFrom }),
}));
vi.mock("@/lib/demo-user", () => ({
  ensureDemoUser: async () => ({ id: "user-1", email: "x", last_synced_at: null }),
}));

import { GET } from "@/app/api/tasks/[taskId]/route";

describe("GET /api/tasks/[taskId]", () => {
  beforeEach(() => mockMaybeSingle.mockReset());

  it("returns sanitized description and metadata", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: "t1",
        title: "Lab 1",
        due_at: "2026-05-01T23:59:00Z",
        description_html: "<p>do it</p><script>x</script>",
      },
      error: null,
    });
    const res = await GET(new Request("http://x/api/tasks/t1"), { params: Promise.resolve({ taskId: "t1" }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.title).toBe("Lab 1");
    expect(json.descriptionHtml).toContain("<p>do it</p>");
    expect(json.descriptionHtml).not.toContain("<script");
  });

  it("returns 404 when task not found", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await GET(new Request("http://x/api/tasks/t1"), { params: Promise.resolve({ taskId: "t1" }) });
    expect(res.status).toBe(404);
  });
});
