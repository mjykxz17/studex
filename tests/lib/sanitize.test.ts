import { describe, it, expect } from "vitest";

import { sanitizeHtml } from "@/lib/sanitize";

describe("sanitizeHtml", () => {
  it("strips <script> tags entirely", () => {
    const out = sanitizeHtml("<p>safe</p><script>alert(1)</script>");
    expect(out).toContain("<p>safe</p>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
  });

  it("strips on* event handlers", () => {
    const out = sanitizeHtml('<a href="/x" onclick="bad()">link</a>');
    expect(out).toContain("href=\"/x\"");
    expect(out).not.toContain("onclick");
  });

  it("retains formatting tags Canvas commonly emits", () => {
    const html =
      '<p><strong>Title</strong></p><ul><li>one</li></ul><pre><code>x</code></pre><table><tr><td>cell</td></tr></table>';
    const out = sanitizeHtml(html);
    expect(out).toContain("<strong>");
    expect(out).toContain("<ul>");
    expect(out).toContain("<li>");
    expect(out).toContain("<pre>");
    expect(out).toContain("<code>");
    expect(out).toContain("<table>");
    expect(out).toContain("<td>");
  });

  it("forces target=_blank rel=noopener on outbound links", () => {
    const out = sanitizeHtml('<a href="https://example.com">x</a>');
    expect(out).toContain("target=\"_blank\"");
    expect(out).toContain("rel=\"noopener noreferrer\"");
  });

  it("strips javascript: URLs", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript:");
  });

  it("returns empty string for null/undefined input", () => {
    expect(sanitizeHtml(null)).toBe("");
    expect(sanitizeHtml(undefined)).toBe("");
  });
});
