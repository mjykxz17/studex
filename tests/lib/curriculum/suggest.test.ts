import { describe, it, expect } from "vitest";

import type { Bucket, TakenModule } from "@/lib/curriculum/types";
import { suggestModulesForBucket } from "@/lib/curriculum/suggest";

const catalog = [
  { code: "CS3235", title: "Computer Security", mc: 4 },
  { code: "CS4238", title: "Computer Security Practice", mc: 4 },
  { code: "CS4239", title: "Software Security", mc: 4 },
  { code: "CS1010", title: "Programming Methodology", mc: 4 },
  { code: "GEX1006", title: "Argumentation", mc: 4 },
  { code: "MA3236", title: "Non-Linear Algebra", mc: 4 },
];

describe("suggestModulesForBucket", () => {
  it("returns up to N modules from a choose_n list, excluding already-taken", () => {
    const bucket: Bucket = {
      id: "elec",
      name: "Electives",
      mc: 8,
      rule: { kind: "choose_n", n: 2, modules: ["CS3235", "CS4238", "CS4239"] },
    };
    const taken: TakenModule[] = [
      { code: "CS3235", mc: 4, status: "completed", bucket_override: null },
    ];
    const suggestions = suggestModulesForBucket(bucket, taken, catalog, 5);
    expect(suggestions.map((s) => s.code)).toEqual(["CS4238", "CS4239"]);
  });

  it("returns all_of missing modules", () => {
    const bucket: Bucket = {
      id: "core",
      name: "Core",
      mc: 8,
      rule: { kind: "all_of", modules: ["CS1010", "CS3235"] },
    };
    const taken: TakenModule[] = [];
    const suggestions = suggestModulesForBucket(bucket, taken, catalog, 5);
    expect(suggestions.map((s) => s.code).sort()).toEqual(["CS1010", "CS3235"]);
  });

  it("returns wildcard catalog matches up to N", () => {
    const bucket: Bucket = {
      id: "ge",
      name: "GE",
      mc: 4,
      rule: { kind: "wildcard", pattern: "GEX%" },
    };
    const suggestions = suggestModulesForBucket(bucket, [], catalog, 5);
    expect(suggestions.map((s) => s.code)).toEqual(["GEX1006"]);
  });

  it("returns open-rule catalog matches respecting constraints", () => {
    const bucket: Bucket = {
      id: "breadth",
      name: "Breadth",
      mc: 12,
      rule: { kind: "open", constraints: { prefix: ["CS"], level_min: 3000 } },
    };
    const suggestions = suggestModulesForBucket(bucket, [], catalog, 5);
    expect(suggestions.map((s) => s.code).sort()).toEqual(["CS3235", "CS4238", "CS4239"]);
  });

  it("returns empty array for OR rules in Phase A", () => {
    const bucket: Bucket = {
      id: "or-bucket",
      name: "OR",
      mc: 8,
      rule: {
        kind: "or",
        options: [
          { modules: ["IFS4205"] },
          { modules: ["CS4238", "IFS4103"] },
        ],
      },
    };
    expect(suggestModulesForBucket(bucket, [], catalog, 5)).toEqual([]);
  });
});
