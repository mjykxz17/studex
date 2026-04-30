import { describe, it, expect } from "vitest";

import { isVideoFilename, isZoomUrl, panoptoEmbedUrl, parseZoomPasscode } from "@/lib/canvas-url";

describe("panoptoEmbedUrl", () => {
  it("swaps Viewer.aspx → Embed.aspx", () => {
    const v = "https://nus-panopto.example/Panopto/Pages/Viewer.aspx?id=abc";
    expect(panoptoEmbedUrl(v)).toBe("https://nus-panopto.example/Panopto/Pages/Embed.aspx?id=abc");
  });

  it("returns null for non-Panopto URLs", () => {
    expect(panoptoEmbedUrl("https://youtube.com/watch?v=x")).toBeNull();
    expect(panoptoEmbedUrl("https://canvas.nus.edu.sg/courses/1")).toBeNull();
  });

  it("handles already-Embed URLs idempotently", () => {
    const e = "https://nus-panopto.example/Panopto/Pages/Embed.aspx?id=abc";
    expect(panoptoEmbedUrl(e)).toBe(e);
  });
});

describe("isVideoFilename", () => {
  it("detects video extensions case-insensitively", () => {
    expect(isVideoFilename("lecture.mp4")).toBe(true);
    expect(isVideoFilename("LECTURE.MOV")).toBe(true);
    expect(isVideoFilename("clip.webm")).toBe(true);
    expect(isVideoFilename("notes.pdf")).toBe(false);
  });
});

describe("isZoomUrl", () => {
  it("matches NUS Zoom share URLs", () => {
    expect(isZoomUrl("https://nus-sg.zoom.us/rec/share/abc")).toBe(true);
  });

  it("matches generic zoom.us URLs", () => {
    expect(isZoomUrl("https://zoom.us/j/123")).toBe(true);
  });

  it("rejects non-Zoom URLs", () => {
    expect(isZoomUrl("https://youtube.com/watch?v=x")).toBe(false);
    expect(isZoomUrl("https://canvas.nus.edu.sg")).toBe(false);
    expect(isZoomUrl("https://example.com/zoom.us")).toBe(false);
  });

  it("returns false for malformed URLs", () => {
    expect(isZoomUrl("not-a-url")).toBe(false);
    expect(isZoomUrl("")).toBe(false);
  });
});

describe("parseZoomPasscode", () => {
  it("extracts passcode from a typical NUS recording title", () => {
    expect(parseZoomPasscode("Week 1 Lecture Recording. Passcode: Mxx1V2B+")).toBe("Mxx1V2B+");
  });

  it("handles double space and capital P", () => {
    expect(parseZoomPasscode("Week 10 Lecture Recording.  Passcode: at.!+%j6")).toBe("at.!+%j6");
  });

  it("strips trailing sentence punctuation", () => {
    expect(parseZoomPasscode("Title (Passcode: hunter2.)")).toBe("hunter2");
  });

  it("returns null when no passcode present", () => {
    expect(parseZoomPasscode("Week 1 Lecture")).toBeNull();
    expect(parseZoomPasscode(null)).toBeNull();
    expect(parseZoomPasscode(undefined)).toBeNull();
    expect(parseZoomPasscode("")).toBeNull();
  });

  it("matches case-insensitive passcode label", () => {
    expect(parseZoomPasscode("Title - passcode abc123")).toBe("abc123");
  });
});
