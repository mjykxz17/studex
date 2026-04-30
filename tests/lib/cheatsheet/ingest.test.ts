import { afterEach, describe, expect, it, vi } from "vitest";

const getTextMock = vi.fn();
const destroyMock = vi.fn(async () => undefined);

// Stable class-based mock so the global vi.restoreAllMocks() in tests/setup.ts
// doesn't wipe the constructor between tests. Only the inner spies are reset.
vi.mock("pdf-parse", () => ({
  PDFParse: class {
    async getText() {
      return getTextMock();
    }
    async destroy() {
      return destroyMock();
    }
  },
}));

import { extractPdfMarkdown } from "@/lib/cheatsheet/ingest";

afterEach(() => {
  getTextMock.mockReset();
  destroyMock.mockClear();
});

describe("extractPdfMarkdown", () => {
  it("returns trimmed and normalized markdown from pdf-parse output", async () => {
    getTextMock.mockResolvedValue({ text: "  Hello\r\nWorld\n\n\n\nMore text  " });
    const md = await extractPdfMarkdown(Buffer.from("any-bytes"));
    expect(md).toBe("Hello\nWorld\n\nMore text");
    expect(destroyMock).toHaveBeenCalled();
  });

  it("throws when the PDF has no extractable text", async () => {
    getTextMock.mockResolvedValue({ text: "   " });
    await expect(extractPdfMarkdown(Buffer.from("x"))).rejects.toThrow(/no extractable text/i);
  });

  it("throws when pdf-parse returns null/undefined text", async () => {
    getTextMock.mockResolvedValue({ text: null });
    await expect(extractPdfMarkdown(Buffer.from("x"))).rejects.toThrow(/no extractable text/i);
  });
});
