import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFromBuilder = () => {
  const single = vi.fn();
  const inIn = vi.fn(() => ({ data: [], error: null }));
  const select = vi.fn(() => ({ in: inIn, single }));
  const upsert = vi.fn(() => ({ data: null, error: null }));
  return { single, inIn, select, upsert };
};

const fromMock = vi.fn();

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: () => ({ from: fromMock }),
}));

import { ensureCatalog } from "@/lib/nus-catalog";

describe("ensureCatalog", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("does no work when all codes are already cached", async () => {
    const builder = mockFromBuilder();
    builder.inIn.mockReturnValue({ data: [{ code: "CS1010" }, { code: "CS2030" }], error: null });
    fromMock.mockReturnValue(builder);
    const fetchMock = vi.fn();

    await ensureCatalog(["CS1010", "CS2030"], fetchMock);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches missing codes from NUSMods and upserts", async () => {
    const builder = mockFromBuilder();
    builder.inIn.mockReturnValue({ data: [{ code: "CS1010" }], error: null });
    fromMock.mockReturnValue(builder);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("CS3235")) {
        return new Response(
          JSON.stringify({
            moduleCode: "CS3235",
            title: "Computer Security",
            moduleCredit: "4",
            faculty: "Computing",
            department: "Computer Science",
            description: "Security topics.",
            semesterData: [{ semester: 2 }],
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    await ensureCatalog(["CS1010", "CS3235"], fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(builder.upsert).toHaveBeenCalled();
    const payload = builder.upsert.mock.calls[0][0];
    expect(payload.code).toBe("CS3235");
    expect(payload.mc).toBe(4);
    expect(payload.level).toBe(3000);
    expect(payload.prefix).toBe("CS");
  });

  it("tolerates 404 for a single module without throwing", async () => {
    const builder = mockFromBuilder();
    builder.inIn.mockReturnValue({ data: [], error: null });
    fromMock.mockReturnValue(builder);
    const fetchMock = vi.fn(async () => new Response("not found", { status: 404 }));

    await expect(ensureCatalog(["NONEXISTENT0000"], fetchMock)).resolves.not.toThrow();
  });
});
