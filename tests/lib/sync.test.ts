import { buildSourceLabel, createContentHash, sanitizeSyncText, stripHtml } from "@/lib/sync";

describe("lib/sync", () => {
  it("sanitizes control characters", () => {
    expect(sanitizeSyncText("Hello\u0000 world\r\n")).toBe("Hello world");
  });

  it("strips HTML into readable text", () => {
    expect(stripHtml("<p>Hello <strong>world</strong><br/>Again</p>")).toContain("Hello world");
  });

  it("creates stable hashes and source labels", () => {
    expect(createContentHash("abc")).toBe(createContentHash("abc"));
    expect(
      buildSourceLabel({
        moduleCode: "CS3235",
        sourceType: "file",
        title: "Week 4 Slides.pdf",
        weekNumber: 4,
      }),
    ).toBe("CS3235 · file · Week 4 · Week 4 Slides.pdf");
  });

  it("keeps stripping html readable when spans and entities are present", () => {
    expect(stripHtml("<div><span>Quiz&nbsp;1</span> &amp; review</div>")).toContain("Quiz 1 & review");
  });
});
