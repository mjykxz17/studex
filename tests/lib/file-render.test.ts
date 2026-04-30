import { describe, it, expect, vi } from "vitest";

vi.mock("mammoth", () => ({
  default: {
    convertToHtml: vi.fn(async () => ({ value: "<p>From mammoth</p>", messages: [] })),
  },
}));

import { renderDocxToHtml } from "@/lib/file-render";

describe("renderDocxToHtml", () => {
  it("returns sanitized HTML from a buffer", async () => {
    const html = await renderDocxToHtml(Buffer.from("fake-docx-bytes"));
    expect(html).toContain("<p>From mammoth</p>");
    expect(html).not.toContain("<script");
  });
});
