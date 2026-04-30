import { describe, it, expect } from "vitest";

import {
  extractLevel,
  extractPrefix,
  matchWildcard,
  qualifiesForConstraints,
} from "@/lib/curriculum/match";

describe("matchWildcard", () => {
  it("matches GEX% prefix", () => {
    expect(matchWildcard("GEX1234", "GEX%")).toBe(true);
    expect(matchWildcard("GEX9999X", "GEX%")).toBe(true);
  });

  it("rejects non-matching prefix", () => {
    expect(matchWildcard("CS1010", "GEX%")).toBe(false);
    expect(matchWildcard("GEX", "GEX%")).toBe(true);    // prefix-only counts
  });

  it("treats pattern without % as exact match", () => {
    expect(matchWildcard("CS1010", "CS1010")).toBe(true);
    expect(matchWildcard("CS1010S", "CS1010")).toBe(false);
  });
});

describe("extractLevel", () => {
  it("returns the thousand of the first 4-digit run", () => {
    expect(extractLevel("CS1010")).toBe(1000);
    expect(extractLevel("CS3235")).toBe(3000);
    expect(extractLevel("MA1521")).toBe(1000);
    expect(extractLevel("CS5331")).toBe(5000);
    expect(extractLevel("IFS4205")).toBe(4000);
  });

  it("handles trailing letters", () => {
    expect(extractLevel("CS2030S")).toBe(2000);
    expect(extractLevel("CS1010X")).toBe(1000);
  });

  it("returns null for malformed codes", () => {
    expect(extractLevel("INVALID")).toBeNull();
    expect(extractLevel("")).toBeNull();
    expect(extractLevel("CS")).toBeNull();
  });
});

describe("extractPrefix", () => {
  it("returns alpha prefix before the first digit", () => {
    expect(extractPrefix("CS1010")).toBe("CS");
    expect(extractPrefix("IFS4205")).toBe("IFS");
    expect(extractPrefix("MA1521")).toBe("MA");
  });

  it("returns null for malformed codes", () => {
    expect(extractPrefix("1010")).toBeNull();
    expect(extractPrefix("")).toBeNull();
  });
});

describe("qualifiesForConstraints", () => {
  it("matches when prefix and level both pass", () => {
    expect(qualifiesForConstraints("CS3235", { prefix: ["CS"], level_min: 3000 })).toBe(true);
  });

  it("rejects when prefix matches but level too low", () => {
    expect(qualifiesForConstraints("CS1010", { prefix: ["CS"], level_min: 3000 })).toBe(false);
  });

  it("rejects when prefix mismatches", () => {
    expect(qualifiesForConstraints("MA3235", { prefix: ["CS", "IS"] })).toBe(false);
  });

  it("returns true when no constraints supplied", () => {
    expect(qualifiesForConstraints("ANY9999", {})).toBe(true);
  });
});
