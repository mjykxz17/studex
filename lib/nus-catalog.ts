import "server-only";

import { extractLevel, extractPrefix } from "@/lib/curriculum/match";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const ACADEMIC_YEAR = "2025-2026";

export type CatalogRow = {
  code: string;
  title: string;
  mc: number;
  level: number | null;
  prefix: string | null;
  faculty: string | null;
  department: string | null;
};

type NUSModsModuleResponse = {
  moduleCode?: string;
  title?: string;
  moduleCredit?: string | number;
  faculty?: string;
  department?: string;
  description?: string;
  prereqTree?: unknown;
  semesterData?: Array<{ semester: number }>;
};

export async function ensureCatalog(
  codes: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (codes.length === 0) return;
  const supabase = getSupabaseAdminClient();
  const unique = Array.from(new Set(codes));

  const { data: existing } = await supabase
    .from("nus_modules")
    .select("code")
    .in("code", unique);
  const have = new Set(((existing ?? []) as Array<{ code: string }>).map((r) => r.code));
  const missing = unique.filter((c) => !have.has(c));

  for (const code of missing) {
    const url = `https://api.nusmods.com/v2/${ACADEMIC_YEAR}/modules/${encodeURIComponent(code)}.json`;
    let res: Response;
    try {
      res = await fetchImpl(url);
    } catch {
      continue;
    }
    if (!res.ok) continue;
    const data = (await res.json()) as NUSModsModuleResponse;
    const title = data.title ?? code;
    const mcText = String(data.moduleCredit ?? "0");
    const mc = Number.parseFloat(mcText);
    const row = {
      code,
      title,
      mc: Number.isFinite(mc) ? mc : 0,
      module_credit_text: mcText,
      level: extractLevel(code),
      prefix: extractPrefix(code),
      faculty: data.faculty ?? null,
      department: data.department ?? null,
      description: data.description ?? null,
      prereq_tree: data.prereqTree ?? null,
      semesters: (data.semesterData ?? []).map((s) => s.semester),
      fetched_at: new Date().toISOString(),
    };
    await supabase.from("nus_modules").upsert(row, { onConflict: "code" });
  }
}

export async function loadCatalog(codes: string[]): Promise<CatalogRow[]> {
  if (codes.length === 0) return [];
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from("nus_modules")
    .select("code, title, mc, level, prefix, faculty, department")
    .in("code", codes);
  return ((data ?? []) as CatalogRow[]) ?? [];
}
