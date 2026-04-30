// Rule kinds expressed in YAML. Each Bucket carries one Rule.
export type Rule =
  | AllOfRule
  | ChooseNRule
  | WildcardRule
  | OrRule
  | OpenRule;

export type AllOfRule = {
  kind: "all_of";
  modules: string[];           // every module here must be taken
};

export type ChooseNRule = {
  kind: "choose_n";
  n: number;                   // number of modules from the list to count
  modules: string[];
};

export type WildcardRule = {
  kind: "wildcard";
  pattern: string;             // e.g., "GEX%" — % is suffix wildcard
};

export type OrRule = {
  kind: "or";
  options: Array<{
    modules: string[];         // all of these must be taken for this branch to satisfy
    label?: string;
  }>;
};

export type OpenRule = {
  kind: "open";
  constraints?: ModuleConstraints;
  note?: string;
};

export type ModuleConstraints = {
  prefix?: string[];           // e.g., ["CS", "IS", "CP"]
  level_min?: number;
  level_max?: number;
};

// A single graduation bucket.
export type Bucket = {
  id: string;                  // stable kebab-case id
  name: string;                // human-readable
  mc: number;                  // MC required to satisfy this bucket
  rule: Rule;
  notes?: string;
};

// Top-level program specification.
export type ProgramSpec = {
  id: string;                  // e.g., 'bcomp-isc-2024'
  name: string;
  matriculation_year: number;
  total_mc: number;
  source_url: string;
  source_fetched_at: string;
  buckets: Bucket[];
};

// User-side data — one row per module the user is associated with.
export type TakenModule = {
  code: string;
  mc: number;                  // resolved from nus_modules
  status: "completed" | "in_progress" | "planning" | "dropped";
  bucket_override: string | null;
};

// Audit output.
export type BucketStatus = "complete" | "in_progress" | "not_started";

export type ModuleSuggestion = {
  code: string;
  title: string;
  mc: number;
};

export type BucketResult = {
  id: string;
  name: string;
  required: number;
  current: number;             // MC counted toward this bucket (capped at required)
  raw: number;                 // MC counted before capping
  status: BucketStatus;
  fulfilling: TakenModule[];
  missing: number;             // MC still needed (0 when complete)
  suggestions: ModuleSuggestion[];
};

export type AuditResult = {
  programId: string;
  programName: string;
  totalMc: { current: number; required: number };
  buckets: BucketResult[];
  blockers: string[];          // human-readable list of "Missing X MC in Y"
  warnings: string[];
  willGraduate: boolean;
};
