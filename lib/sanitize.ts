import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "a", "p", "br", "hr", "div", "span", "strong", "em", "b", "i", "u",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "table", "thead", "tbody", "tr", "td", "th",
  "img",
  "sub", "sup",
];

const ALLOWED_ATTR = ["href", "src", "alt", "title", "target", "rel", "colspan", "rowspan"];

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";

  // Force outbound links to open in a new tab with safe rel.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.getAttribute("href")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });

  const clean = DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });

  DOMPurify.removeAllHooks();
  return clean;
}
