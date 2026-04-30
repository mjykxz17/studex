import {
  matchWildcard,
  qualifiesForConstraints,
} from "@/lib/curriculum/match";
import type {
  Bucket,
  ModuleSuggestion,
  TakenModule,
} from "@/lib/curriculum/types";

export type CatalogEntry = {
  code: string;
  title: string;
  mc: number;
};

export function suggestModulesForBucket(
  bucket: Bucket,
  takings: TakenModule[],
  catalog: CatalogEntry[],
  limit: number,
): ModuleSuggestion[] {
  const takenCodes = new Set(takings.map((t) => t.code));
  const fromCatalog = (codes: string[]): ModuleSuggestion[] =>
    codes
      .filter((c) => !takenCodes.has(c))
      .map((c) => catalog.find((m) => m.code === c) ?? { code: c, title: c, mc: 4 })
      .slice(0, limit);

  switch (bucket.rule.kind) {
    case "all_of":
      return fromCatalog(bucket.rule.modules);
    case "choose_n":
      return fromCatalog(bucket.rule.modules);
    case "wildcard": {
      const pattern = bucket.rule.pattern;
      return catalog
        .filter((m) => matchWildcard(m.code, pattern))
        .filter((m) => !takenCodes.has(m.code))
        .slice(0, limit);
    }
    case "open": {
      const constraints = bucket.rule.constraints;
      return catalog
        .filter((m) => (constraints ? qualifiesForConstraints(m.code, constraints) : true))
        .filter((m) => !takenCodes.has(m.code))
        .slice(0, limit);
    }
    case "or":
      // Phase A: no suggestions for OR (caller should render the option labels instead)
      return [];
  }
}
