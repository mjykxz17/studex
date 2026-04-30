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
  ensureDemoUser: async () => ({ id: "user-1", email: "test@x", last_synced_at: null }),
}));

import { GET } from "@/app/api/pages/[pageId]/route";

describe("GET /api/pages/[pageId]", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
  });

  it("returns sanitized body when page is found", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: "p1", title: "Week 1", body_html: "<p>hi</p><script>x</script>" },
      error: null,
    });

    const res = await GET(new Request("http://x/api/pages/p1"), { params: Promise.resolve({ pageId: "p1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.title).toBe("Week 1");
    expect(json.bodyHtml).toContain("<p>hi</p>");
    expect(json.bodyHtml).not.toContain("<script");
  });

  it("returns 404 when page not found", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await GET(new Request("http://x/api/pages/p1"), { params: Promise.resolve({ pageId: "p1" }) });
    expect(res.status).toBe(404);
  });
});
