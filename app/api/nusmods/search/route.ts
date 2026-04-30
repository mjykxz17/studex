export const dynamic = "force-dynamic";

const ACADEMIC_YEAR = "2025-2026";
const MODULE_LIST_URL = `https://api.nusmods.com/v2/${ACADEMIC_YEAR}/moduleList.json`;

type NUSModsModuleSummary = {
  moduleCode: string;
  title: string;
  semesters: number[];
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return Response.json({ results: [] });
  }

  // Next.js caches this for 1 hour — moduleList.json is ~250 KB but rarely changes.
  const res = await fetch(MODULE_LIST_URL, { next: { revalidate: 3600 } });
  if (!res.ok) {
    return Response.json({ error: `NUSMods returned ${res.status}` }, { status: 502 });
  }
  const all = (await res.json()) as NUSModsModuleSummary[];

  const needle = q.toLowerCase();
  const matches = all.filter(
    (m) => m.moduleCode.toLowerCase().includes(needle) || m.title.toLowerCase().includes(needle),
  );

  // Prefer code-prefix matches first, then title matches.
  matches.sort((a, b) => {
    const aPrefix = a.moduleCode.toLowerCase().startsWith(needle) ? 0 : 1;
    const bPrefix = b.moduleCode.toLowerCase().startsWith(needle) ? 0 : 1;
    if (aPrefix !== bPrefix) return aPrefix - bPrefix;
    return a.moduleCode.localeCompare(b.moduleCode);
  });

  return Response.json({
    results: matches.slice(0, 20).map((m) => ({
      code: m.moduleCode,
      title: m.title,
      semesters: m.semesters,
    })),
  });
}
