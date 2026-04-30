const PANOPTO_VIEWER_RE = /\/Pages\/Viewer\.aspx/i;
const PANOPTO_EMBED_RE = /\/Pages\/Embed\.aspx/i;
const VIDEO_EXTS = [".mp4", ".mov", ".webm", ".m4v"];

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
