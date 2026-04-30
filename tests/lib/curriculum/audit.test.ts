import { describe, it, expect } from "vitest";

import { auditDegree } from "@/lib/curriculum/audit";
import type { ProgramSpec, TakenModule } from "@/lib/curriculum/types";

const taken = (
  code: string,
  mc: number,
  status: TakenModule["status"] = "completed",
  bucket_override: string | null = null,
): TakenModule => ({ code, mc, status, bucket_override });

const baseSpec: ProgramSpec = {
  id: "test-prog",
  name: "Test Program",
  matriculation_year: 2024,
  total_mc: 28,
  source_url: "https://example/curr",
  source_fetched_at: "2026-05-01",
  buckets: [
    { id: "core", name: "Core", mc: 8, rule: { kind: "all_of", modules: ["CS1010", "CS2030"] } },
    { id: "math", name: "Math", mc: 4, rule: { kind: "all_of", modules: ["MA1521"] } },
    { id: "ge", name: "GE", mc: 4, rule: { kind: "wildcard", pattern: "GEX%" } },
    { id: "elective", name: "Elective", mc: 8, rule: { kind: "choose_n", n: 2, modules: ["CS3235", "CS4238", "CS4257"] } },
    { id: "ue", name: "UE", mc: 4, rule: { kind: "open" } },
  ],
};

describe("auditDegree", () => {
  it("zero progress when no takings", () => {
    const result = auditDegree(baseSpec, []);
    expect(result.totalMc.current).toBe(0);
    expect(result.totalMc.required).toBe(28);
    expect(result.willGraduate).toBe(false);
    expect(result.buckets.every((b) => b.status === "not_started")).toBe(true);
  });

  it("counts all_of modules into the right bucket", () => {
    const result = auditDegree(baseSpec, [taken("CS1010", 4), taken("CS2030", 4)]);
    const core = result.buckets.find((b) => b.id === "core")!;
    expect(core.current).toBe(8);
    expect(core.status).toBe("complete");
    expect(core.fulfilling.map((t) => t.code).sort()).toEqual(["CS1010", "CS2030"]);
  });

  it("counts wildcard matches", () => {
    const result = auditDegree(baseSpec, [taken("GEX1006", 4)]);
    const ge = result.buckets.find((b) => b.id === "ge")!;
    expect(ge.current).toBe(4);
    expect(ge.status).toBe("complete");
  });

  it("caps choose_n at the required mc", () => {
    const result = auditDegree(baseSpec, [
      taken("CS3235", 4),
      taken("CS4238", 4),
      taken("CS4257", 4),
    ]);
    const elec = result.buckets.find((b) => b.id === "elective")!;
    expect(elec.current).toBe(8);
    expect(elec.raw).toBe(12);
  });

  it("places extra choose_n into UE", () => {
    const result = auditDegree(baseSpec, [
      taken("CS3235", 4),
      taken("CS4238", 4),
      taken("CS4257", 4),
    ]);
    const ue = result.buckets.find((b) => b.id === "ue")!;
    expect(ue.current).toBe(4);
  });

  it("respects bucket_override", () => {
    const result = auditDegree(baseSpec, [
      taken("CS3235", 4, "completed", "ue"),
      taken("CS4238", 4),
    ]);
    const ue = result.buckets.find((b) => b.id === "ue")!;
    expect(ue.fulfilling.map((t) => t.code)).toContain("CS3235");
    const elec = result.buckets.find((b) => b.id === "elective")!;
    expect(elec.fulfilling.map((t) => t.code)).not.toContain("CS3235");
  });

  it("declares willGraduate true when all buckets complete", () => {
    const result = auditDegree(baseSpec, [
      taken("CS1010", 4),
      taken("CS2030", 4),
      taken("MA1521", 4),
      taken("GEX1006", 4),
      taken("CS3235", 4),
      taken("CS4238", 4),
      taken("UE0001", 4),
    ]);
    expect(result.totalMc.current).toBe(28);
    expect(result.willGraduate).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("OR rule: branch A satisfies", () => {
    const orSpec: ProgramSpec = {
      ...baseSpec,
      total_mc: 8,
      buckets: [
        {
          id: "or-bucket",
          name: "OR",
          mc: 8,
          rule: {
            kind: "or",
            options: [
              { modules: ["IFS4205"], label: "research" },
              { modules: ["CS4238", "IFS4103"], label: "pair" },
            ],
          },
        },
      ],
    };
    const result = auditDegree(orSpec, [taken("IFS4205", 8)]);
    const b = result.buckets[0];
    expect(b.current).toBe(8);
    expect(b.status).toBe("complete");
  });

  it("OR rule: branch B satisfies (both modules required)", () => {
    const orSpec: ProgramSpec = {
      ...baseSpec,
      total_mc: 8,
      buckets: [
        {
          id: "or-bucket",
          name: "OR",
          mc: 8,
          rule: {
            kind: "or",
            options: [
              { modules: ["IFS4205"], label: "research" },
              { modules: ["CS4238", "IFS4103"], label: "pair" },
            ],
          },
        },
      ],
    };
    const partial = auditDegree(orSpec, [taken("CS4238", 4)]);
    expect(partial.buckets[0].status).toBe("not_started");

    const full = auditDegree(orSpec, [taken("CS4238", 4), taken("IFS4103", 4)]);
    expect(full.buckets[0].current).toBe(8);
    expect(full.buckets[0].status).toBe("complete");
  });

  it("open rule with constraints accepts only matching prefix and level", () => {
    const openSpec: ProgramSpec = {
      ...baseSpec,
      total_mc: 8,
      buckets: [
        {
          id: "breadth",
          name: "Breadth",
          mc: 8,
          rule: { kind: "open", constraints: { prefix: ["CS", "IS"], level_min: 3000 } },
        },
      ],
    };
    const result = auditDegree(openSpec, [
      taken("CS3235", 4),
      taken("CS1010", 4),       // wrong level
      taken("MA3000", 4),       // wrong prefix
    ]);
    expect(result.buckets[0].current).toBe(4);
    expect(result.buckets[0].fulfilling.map((t) => t.code)).toEqual(["CS3235"]);
  });

  it("ignores dropped status", () => {
    const result = auditDegree(baseSpec, [taken("CS1010", 4, "dropped")]);
    expect(result.buckets.find((b) => b.id === "core")!.current).toBe(0);
  });

  it("counts in_progress toward current MC (lenient)", () => {
    const result = auditDegree(baseSpec, [taken("CS1010", 4, "in_progress")]);
    expect(result.buckets.find((b) => b.id === "core")!.current).toBe(4);
  });
});
