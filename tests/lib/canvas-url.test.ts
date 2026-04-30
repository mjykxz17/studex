import { describe, it, expect } from "vitest";

import { panoptoEmbedUrl, isVideoFilename } from "@/lib/canvas-url";

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
