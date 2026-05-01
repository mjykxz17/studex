import { describe, it, expect } from "vitest";
import { cn } from "@/app/ui/primitives/cn";

describe("cn", () => {
  it("joins truthy strings with single spaces", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });
  it("filters out falsy values", () => {
    expect(cn("a", false, "b", null, "c", undefined, 0, "")).toBe("a b c");
  });
  it("returns empty string for no truthy args", () => {
    expect(cn(false, null, undefined, "")).toBe("");
  });
});
