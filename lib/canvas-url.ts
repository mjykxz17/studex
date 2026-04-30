const PANOPTO_VIEWER_RE = /\/Pages\/Viewer\.aspx/i;
const PANOPTO_EMBED_RE = /\/Pages\/Embed\.aspx/i;
const VIDEO_EXTS = [".mp4", ".mov", ".webm", ".m4v"];
const ZOOM_HOST_RE = /(?:^|\.)zoom\.us(?:$|\/)/i;
const PASSCODE_RE = /Passcode\s*[:\-]?\s*(\S+)/i;

export function panoptoEmbedUrl(url: string): string | null {
  if (PANOPTO_EMBED_RE.test(url)) return url;
  if (PANOPTO_VIEWER_RE.test(url)) {
    return url.replace(PANOPTO_VIEWER_RE, "/Pages/Embed.aspx");
  }
  return null;
}

export function isVideoFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return VIDEO_EXTS.some((ext) => lower.endsWith(ext));
}

export function isZoomUrl(url: string): boolean {
  try {
    return ZOOM_HOST_RE.test(new URL(url).host);
  } catch {
    return false;
  }
}

export function parseZoomPasscode(title: string | null | undefined): string | null {
  if (!title) return null;
  const match = title.match(PASSCODE_RE);
  // Strip trailing punctuation that the lecturer's sentence might leave attached.
  return match ? match[1].replace(/[.,;)]+$/, "") : null;
}
