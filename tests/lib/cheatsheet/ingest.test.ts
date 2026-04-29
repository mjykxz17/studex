import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

import pdfParse from "pdf-parse";

import { extractPdfMarkdown } from "@/lib/cheatsheet/ingest";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("extractPdfMarkdown", () => {
  it("returns trimmed and normalized markdown from pdf-parse output", async () => {
    vi.mocked(pdfParse).mockResolvedValue({
      text: "  Hello\r\nWorld\n\n\n\nMore text  ",
    } as never);
    const md = await extractPdfMarkdown(Buffer.from("any-bytes"));
    expect(md).toBe("Hello\nWorld\n\nMore text");
  });

  it("throws when the PDF has no extractable text", async () => {
    vi.mocked(pdfParse).mockResolvedValue({ text: "   " } as never);
    await expect(extractPdfMarkdown(Buffer.from("x"))).rejects.toThrow(/no extractable text/i);
  });

  it("throws when pdf-parse returns null/undefined text", async () => {
    vi.mocked(pdfParse).mockResolvedValue({ text: null } as never);
    await expect(extractPdfMarkdown(Buffer.from("x"))).rejects.toThrow(/no extractable text/i);
  });
});
