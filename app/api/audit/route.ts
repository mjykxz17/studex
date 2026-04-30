export const dynamic = "force-dynamic";

import { auditDegreeWithSuggestions } from "@/lib/curriculum/audit";
import { loadProgramSpec } from "@/lib/curriculum/loader";
import type { TakenModule } from "@/lib/curriculum/types";
import { ensureDemoUser } from "@/lib/demo-user";
import { ensureCatalog, loadCatalog } from "@/lib/nus-catalog";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const DEFAULT_PROGRAM_ID = "bcomp-isc-2024";

function collectReferencedCodes(spec: Awaited<ReturnType<typeof loadProgramSpec>>): string[] {
  const codes: string[] = [];
  for (const b of spec.buckets) {
    if (b.rule.kind === "all_of" || b.rule.kind === "choose_n") {
      codes.push(...b.rule.modules);
    }
    if (b.rule.kind === "or") {
      for (const opt of b.rule.options) codes.push(...opt.modules);
    }
  }
  return codes;
}

export async function GET(_request: Request) {
  const user = await ensureDemoUser();
  const supabase = getSupabaseAdminClient();

  const { data: programRow } = await supabase
    .from("user_programs")
    .select("program_id")
    .eq("user_id", user.id)
    .eq("is_primary", true)
    .maybeSingle<{ program_id: string }>();
  const programId = programRow?.program_id ?? DEFAULT_PROGRAM_ID;

  let spec;
  try {
    spec = await loadProgramSpec(programId);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load program spec" },
      { status: 500 },
    );
  }

  const { data: takingsRows } = await supabase
    .from("module_takings")
    .select("module_code, status, bucket_override")
    .eq("user_id", user.id);
  const codes = (takingsRows ?? []).map((r) => r.module_code as string);

  const allCodes = [...new Set([...codes, ...collectReferencedCodes(spec)])];
  await ensureCatalog(allCodes);
  const catalog = await loadCatalog(allCodes);
  const mcByCode = new Map(catalog.map((c) => [c.code, c.mc]));

  const takings: TakenModule[] = (takingsRows ?? []).map((r) => ({
    code: r.module_code as string,
    mc: mcByCode.get(r.module_code as string) ?? 4,
    status: r.status as TakenModule["status"],
    bucket_override: (r.bucket_override as string | null) ?? null,
  }));

  const result = auditDegreeWithSuggestions(spec, takings, catalog);
  return Response.json(result);
}
