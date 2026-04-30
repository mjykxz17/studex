import { describe, it, expect } from "vitest";

import { sanitizeHtml } from "@/lib/sanitize";

describe("assignment description persistence (contract)", () => {
  it("sanitizeHtml is wired the way syncAssignment will use it", () => {
    // Sanity: the helper sync uses produces safe HTML.
    const dirty = '<p>Assignment intro</p><script>x</script>';
    const clean = sanitizeHtml(dirty);
    expect(clean).toContain("<p>");
    expect(clean).not.toContain("<script");
  });
});
