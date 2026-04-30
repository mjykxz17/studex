import { describe, it, expect, vi, beforeEach } from "vitest";

const orderEq = vi.fn();
const insertOrUpsert = vi.fn(() => ({ data: null, error: null }));
const deleteEq = vi.fn(() => ({ data: null, error: null }));
const fromMock = vi.fn(() => ({
  select: () => ({ eq: () => ({ order: orderEq }) }),
  upsert: insertOrUpsert,
  delete: () => ({ eq: () => ({ eq: deleteEq }) }),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: () => ({ from: fromMock }),
}));
vi.mock("@/lib/demo-user", () => ({
  ensureDemoUser: async () => ({ id: "user-1", email: "x", last_synced_at: null }),
}));

import { GET, POST, DELETE } from "@/app/api/module-takings/route";

describe("/api/module-takings", () => {
  beforeEach(() => {
    orderEq.mockReset();
    insertOrUpsert.mockClear();
    deleteEq.mockClear();
  });

  it("GET returns the user's takings", async () => {
    orderEq.mockReturnValue({
      data: [
        { id: "t1", module_code: "CS3235", status: "completed", bucket_override: null, grade: "A" },
      ],
      error: null,
    });
    const res = await GET(new Request("http://x/api/module-takings"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.takings).toHaveLength(1);
    expect(json.takings[0].module_code).toBe("CS3235");
  });

  it("POST upserts a taking", async () => {
    const body = JSON.stringify({ module_code: "CS3235", status: "completed", grade: "A" });
    const res = await POST(new Request("http://x/api/module-takings", { method: "POST", body }));
    expect(res.status).toBe(200);
    expect(insertOrUpsert).toHaveBeenCalled();
    const payload = insertOrUpsert.mock.calls[0][0];
    expect(payload.module_code).toBe("CS3235");
    expect(payload.status).toBe("completed");
  });

  it("POST rejects invalid status", async () => {
    const body = JSON.stringify({ module_code: "CS3235", status: "bogus" });
    const res = await POST(new Request("http://x/api/module-takings", { method: "POST", body }));
    expect(res.status).toBe(400);
  });

  it("DELETE removes by module_code", async () => {
    const body = JSON.stringify({ module_code: "CS3235" });
    const res = await DELETE(new Request("http://x/api/module-takings", { method: "DELETE", body }));
    expect(res.status).toBe(200);
    expect(deleteEq).toHaveBeenCalled();
  });
});
