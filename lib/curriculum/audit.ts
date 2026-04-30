import {
  qualifiesForConstraints,
  matchWildcard,
} from "@/lib/curriculum/match";
import { suggestModulesForBucket, type CatalogEntry } from "@/lib/curriculum/suggest";
import type {
  AuditResult,
  Bucket,
  BucketResult,
  BucketStatus,
  ProgramSpec,
  TakenModule,
} from "@/lib/curriculum/types";

export function auditDegree(spec: ProgramSpec, allTakings: TakenModule[]): AuditResult {
  // Filter out dropped — they don't count.
  const takings = allTakings.filter((t) => t.status !== "dropped");

  // Greedy assignment: walk buckets in spec order, assigning each unassigned
  // module to the first bucket that accepts it AND still has room.
  const assignedTo = new Map<string, string>();   // module code -> bucket id

  // First pass: honour bucket_override.
  for (const t of takings) {
    if (t.bucket_override) assignedTo.set(t.code, t.bucket_override);
  }

  // Second pass: handle OR buckets (they bind module sets atomically).
  for (const bucket of spec.buckets) {
    if (bucket.rule.kind !== "or") continue;
    for (const opt of bucket.rule.options) {
      const allTaken = opt.modules.every((m) =>
        takings.some((t) => t.code === m && !assignedTo.has(t.code)),
      );
      if (allTaken) {
        for (const m of opt.modules) assignedTo.set(m, bucket.id);
        break;
      }
    }
  }

  // Third pass: greedy assignment for non-OR rules.
  for (const bucket of spec.buckets) {
    if (bucket.rule.kind === "or") continue;
    let bucketCurrent = sumAssigned(takings, assignedTo, bucket.id);
    for (const t of takings) {
      if (assignedTo.has(t.code)) continue;
      if (!qualifiesForBucket(t, bucket, takings)) continue;
      if (bucketCurrent >= bucket.mc) break;
      assignedTo.set(t.code, bucket.id);
      bucketCurrent += t.mc;
    }
  }

  // Build per-bucket result.
  const bucketResults: BucketResult[] = spec.buckets.map((b) => {
    const fulfilling = takings.filter((t) => assignedTo.get(t.code) === b.id);
    // raw: total MC of all modules that qualify for this bucket's rule,
    // regardless of how many were actually assigned (useful for choose_n
    // where extras spill to a later bucket).
    const raw = computeRaw(takings, b, assignedTo);
    const current = Math.min(
      fulfilling.reduce((s, t) => s + t.mc, 0),
      b.mc,
    );
    const status: BucketStatus =
      current >= b.mc ? "complete" : current > 0 ? "in_progress" : "not_started";
    return {
      id: b.id,
      name: b.name,
      required: b.mc,
      current,
      raw,
      status,
      fulfilling,
      missing: Math.max(0, b.mc - current),
      suggestions: [],   // populated by lib/curriculum/suggest.ts in Task 8
    };
  });

  const totalCurrent = bucketResults.reduce((s, b) => s + b.current, 0);
  const blockers = bucketResults
    .filter((b) => b.missing > 0)
    .map((b) => `Missing ${b.missing} MC in ${b.name}`);

  return {
    programId: spec.id,
    programName: spec.name,
    totalMc: { current: totalCurrent, required: spec.total_mc },
    buckets: bucketResults,
    blockers,
    warnings: [],
    willGraduate: totalCurrent >= spec.total_mc && bucketResults.every((b) => b.current >= b.required),
  };
}

/**
 * Compute the raw MC for a bucket — the total MC of all taken modules that
 * qualify for this bucket's rule (regardless of assignment). For choose_n
 * this reflects the full eligible pool, even if only a subset was assigned
 * and the rest spilled to a later bucket.
 */
function computeRaw(
  takings: TakenModule[],
  bucket: Bucket,
  assignedTo: Map<string, string>,
): number {
  if (bucket.rule.kind === "or") {
    // For OR buckets, raw = MC of the modules actually assigned to this bucket.
    return takings
      .filter((t) => assignedTo.get(t.code) === bucket.id)
      .reduce((s, t) => s + t.mc, 0);
  }
  if (bucket.rule.kind === "choose_n") {
    // raw = total MC of ALL modules in the eligible list that were taken,
    // not just the ones that fit within the MC cap.
    return takings
      .filter((t) => bucket.rule.kind === "choose_n" && bucket.rule.modules.includes(t.code))
      .reduce((s, t) => s + t.mc, 0);
  }
  // For all other kinds, raw = MC of assigned modules (same as current before capping).
  return takings
    .filter((t) => assignedTo.get(t.code) === bucket.id)
    .reduce((s, t) => s + t.mc, 0);
}

function sumAssigned(
  takings: TakenModule[],
  assigned: Map<string, string>,
  bucketId: string,
): number {
  return takings
    .filter((t) => assigned.get(t.code) === bucketId)
    .reduce((s, t) => s + t.mc, 0);
}

function qualifiesForBucket(t: TakenModule, bucket: Bucket, allTakings: TakenModule[]): boolean {
  void allTakings; // reserved for future cross-rule constraints
  switch (bucket.rule.kind) {
    case "all_of":
    case "choose_n":
      return bucket.rule.modules.includes(t.code);
    case "wildcard":
      return matchWildcard(t.code, bucket.rule.pattern);
    case "open":
      return bucket.rule.constraints
        ? qualifiesForConstraints(t.code, bucket.rule.constraints)
        : true;
    case "or":
      return false;   // OR handled in second pass
  }
}

export function auditDegreeWithSuggestions(
  spec: ProgramSpec,
  takings: TakenModule[],
  catalog: CatalogEntry[],
  suggestionLimit = 5,
): AuditResult {
  const result = auditDegree(spec, takings);
  result.buckets = result.buckets.map((b) => {
    const bucketSpec = spec.buckets.find((s) => s.id === b.id)!;
    return {
      ...b,
      suggestions:
        b.missing > 0
          ? suggestModulesForBucket(bucketSpec, takings, catalog, suggestionLimit)
          : [],
    };
  });
  return result;
}
