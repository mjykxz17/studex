const PANOPTO_VIEWER_RE = /\/Pages\/Viewer\.aspx/i;
const PANOPTO_EMBED_RE = /\/Pages\/Embed\.aspx/i;
const PANOPTO_DOMAIN_RE = /panopto/i;
const PANOPTO_LABEL_RE = /panopto|lecture\s*record/i;
const VIDEO_EXTS = [".mp4", ".mov", ".webm", ".m4v"];
const ZOOM_HOST_RE = /(?:^|\.)zoom\.us(?:$|\/)/i;
const PASSCODE_RE = /Passcode\s*[:\-]?\s*(\S+)/i;

export type PanoptoCandidateTab = {
  label?: string | null;
  hidden?: boolean | null;
  external_url?: string | null;
  full_url?: string | null;
};

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

export function detectPanoptoTab(tabs: PanoptoCandidateTab[]): string | null {
  for (const tab of tabs) {
    if (tab.hidden) continue;
    const labelLooksPanopto = PANOPTO_LABEL_RE.test(tab.label ?? "");
    const externalLooksPanopto = tab.external_url ? PANOPTO_DOMAIN_RE.test(tab.external_url) : false;
    if (!labelLooksPanopto && !externalLooksPanopto) continue;
    // Prefer a direct panopto.com URL if the tab provides one (rare — usually LTI).
    if (tab.external_url && PANOPTO_DOMAIN_RE.test(tab.external_url)) return tab.external_url;
    // Fall back to the Canvas-internal full URL; clicking it triggers Canvas's
    // own LTI launch that redirects to Panopto.
    if (tab.full_url) return tab.full_url;
    if (tab.external_url) return tab.external_url;
  }
  return null;
}
