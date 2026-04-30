import { describe, it, expect } from "vitest";

import { loadProgramSpec } from "@/lib/curriculum/loader";

describe("loadProgramSpec", () => {
  it("loads InfoSec AY2024 spec from disk", async () => {
    const spec = await loadProgramSpec("bcomp-isc-2024");
    expect(spec.id).toBe("bcomp-isc-2024");
    expect(spec.total_mc).toBe(160);
    expect(spec.buckets.length).toBeGreaterThan(10);
    const totalDeclared = spec.buckets.reduce((s, b) => s + b.mc, 0);
    expect(totalDeclared).toBe(160);
  });

  it("throws when program id is unknown", async () => {
    await expect(loadProgramSpec("does-not-exist")).rejects.toThrow(/not found/i);
  });

  it("includes the InfoSec all_of foundation modules", async () => {
    const spec = await loadProgramSpec("bcomp-isc-2024");
    const foundation = spec.buckets.find((b) => b.id === "foundation");
    expect(foundation).toBeDefined();
    expect(foundation!.rule.kind).toBe("all_of");
    if (foundation!.rule.kind === "all_of") {
      expect(foundation!.rule.modules).toContain("CS1231S");
      expect(foundation!.rule.modules).toContain("CS2103T");
    }
  });
});
