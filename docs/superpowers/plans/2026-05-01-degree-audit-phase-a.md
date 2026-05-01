# Degree Audit Phase A — Implementation Plan (Information Security)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working degree-audit Progress tab for NUS BComp Information Security (AY2024/25 cohort) — students see graduation buckets, current MC progress per bucket, fulfilling-modules list, and "what to take next" suggestions.

**Architecture:** Curriculum requirements live as version-controlled YAML in `data/curricula/`. A pure-function audit engine consumes a parsed program spec + the user's `module_takings` rows, produces a typed `AuditResult` (per-bucket progress + suggestions + blockers). Module metadata is cached lazily in a new `nus_modules` table seeded from NUSMods' public API. Module takings are auto-populated from the existing `courses` table (Canvas-synced courses become "in-progress" rows) and editable by the user. The Progress tab in `nusmods-view.tsx` renders the audit result; Current Sem stays as-is, Planning is stubbed for Phase B.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Supabase Postgres · Tailwind · vitest + RTL · `js-yaml` (new) · NUSMods public API · Existing `lib/sanitize.ts`, `lib/canvas-url.ts`, `lib/dashboard.ts` patterns

**Estimated effort:** 15–20 hours of focused work for one developer.

---

## File Map

**New files:**
- `data/curricula/bcomp-isc-2024.yaml` — Information Security curriculum spec (single source of truth, version-controlled)
- `lib/curriculum/types.ts` — `ProgramSpec`, `Bucket`, `Rule`, `AuditResult`, `BucketResult`, `TakenModule`, `ModuleSuggestion`
- `lib/curriculum/loader.ts` — `loadProgramSpec(programId)` — reads YAML, validates against types, returns typed `ProgramSpec` or throws
- `lib/curriculum/match.ts` — pure-function predicates: `matchWildcard(code, pattern)`, `extractLevel(code)`, `extractPrefix(code)`, `qualifiesForRule(module, rule, allTaken)`
- `lib/curriculum/audit.ts` — `auditDegree(spec, takings)` returns `AuditResult`
- `lib/curriculum/suggest.ts` — `suggestModulesForBucket(bucket, takings, catalog, n)` returns up to N module suggestions
- `lib/nus-catalog.ts` — `ensureCatalog(codes)`, `getModuleMeta(code)` — lazy NUSMods fetcher backed by `nus_modules` table
- `app/api/audit/route.ts` — GET returns the user's audit
- `app/api/module-takings/route.ts` — GET (list user's takings), POST (upsert), DELETE (remove)
- `app/ui/progress/progress-view.tsx` — renders `AuditResult` as bucket cards
- `app/ui/progress/bucket-card.tsx` — single-bucket UI with progress bar + fulfilling list + suggestions
- `app/ui/progress/module-takings-editor.tsx` — quick-edit list (status / bucket override) for one module
- `supabase/migrations/0010_add_curriculum_tables.sql`

**Modified files:**
- `lib/sync.ts` — auto-upsert `module_takings` row when a Canvas course is synced (status: `in_progress`)
- `lib/contracts.ts` — add `AuditResult` and `BucketResult` types (re-exported from `lib/curriculum/types`)
- `lib/dashboard.ts` — expose user's `program_id` to the dashboard so the Progress tab knows what to audit
- `app/ui/dashboard/nusmods-view.tsx` — add 3-tab structure (Current Sem / Progress / Planning); existing content moves to Current Sem; Progress wires `ProgressView`; Planning is stub
- `supabase/schema.sql` — mirror migration 0010
- `package.json` — add `js-yaml` and `@types/js-yaml`

**Deferred (Phase B+):** Crawlers, multi-major support, Planning tab, prereq enforcement, year-of-matriculation versioning, crowdsourced spec contributions.

---

## Pre-flight

This plan assumes:
- Dashboard works (migration **0009** for `panopto_tab_url` has been applied)
- The `phase-d-cheatsheet` branch is current
- Tests / lint are green at the start (134/134 from the prior plan)

Tasks that require manual SQL application against the live DB are explicitly marked with **🔴 MANUAL STEP**.

---

## Task 1: Schema migration 0010 — nus_modules + module_takings + user_programs

**Files:**
- Create: `supabase/migrations/0010_add_curriculum_tables.sql`
- Modify: `supabase/schema.sql`

Three new tables. `nus_modules` is the lazily-populated catalog. `module_takings` is the per-user history. `user_programs` is the user's program selection (Phase A: one row per user, but the table allows future multi-program).

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/0010_add_curriculum_tables.sql`:

```sql
-- 0010: degree audit phase A — NUSMods catalog cache, user module history,
-- and program selection. The audit engine joins these three to produce the
-- per-bucket progress shown in the Progress tab.

create table if not exists nus_modules (
  code text primary key,
  title text not null,
  mc numeric(4,1) not null default 0,
  module_credit_text text,         -- raw "4 MC" string from NUSMods, kept for fidelity
  level int,                        -- derived from code (CS3235 -> 3000)
  prefix text,                      -- derived from code ("CS")
  faculty text,
  department text,
  description text,
  prereq_tree jsonb,                -- raw prereqTree from NUSMods (nullable)
  semesters int[],                  -- which semesters offered
  fetched_at timestamptz default now()
);

create index if not exists nus_modules_prefix_level_idx on nus_modules (prefix, level);

create table if not exists module_takings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  module_code text not null,
  status text not null check (status in ('completed', 'in_progress', 'planning', 'dropped')),
  semester text,                    -- e.g., 'AY24/25 Sem 2' (free-form for now)
  grade text,                       -- 'A+', 'A', ..., 'F', 'S', 'U' or null
  bucket_override text,             -- user-chosen bucket id; null means greedy
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, module_code)
);

create table if not exists user_programs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  program_id text not null,         -- e.g., 'bcomp-isc-2024'
  matriculation_year int,
  is_primary bool default true,
  created_at timestamptz default now(),
  unique (user_id, program_id)
);
```

- [ ] **Step 2: 🔴 MANUAL STEP — apply migration in Supabase SQL Editor**

Paste the entire contents of `supabase/migrations/0010_add_curriculum_tables.sql` into Supabase Dashboard → SQL Editor → New query → Run.

Verify with:
```sql
select table_name from information_schema.tables
where table_name in ('nus_modules', 'module_takings', 'user_programs');
```
Expected: 3 rows.

- [ ] **Step 3: Mirror migration into canonical schema**

Modify `supabase/schema.sql`. Append the three CREATE TABLE statements above to the end of the file (after the last existing CREATE statement). Preserve all existing content.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_add_curriculum_tables.sql supabase/schema.sql
git commit -m "feat(schema): add nus_modules, module_takings, user_programs"
```

---

## Task 2: Add js-yaml dependency

**Files:**
- Modify: `package.json`

The curriculum spec is YAML for human authoring. `js-yaml` is the standard Node parser; `@types/js-yaml` provides types.

- [ ] **Step 1: Install**

```bash
npm install js-yaml@^4.1.0
npm install --save-dev @types/js-yaml@^4.0.9
```

Expected: 2 packages added; lockfile updated.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add js-yaml for curriculum spec parsing"
```

---

## Task 3: Define curriculum types

**Files:**
- Create: `lib/curriculum/types.ts`

The complete type surface for the audit engine. Other tasks reference these types — get the names right here.

- [ ] **Step 1: Create the types file**

Create `lib/curriculum/types.ts`:

```typescript
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/curriculum/types.ts
git commit -m "feat(curriculum): add type surface for audit engine"
```

---

## Task 4: Implement match helpers

**Files:**
- Create: `lib/curriculum/match.ts`
- Create: `tests/lib/curriculum/match.test.ts`

Pure-function helpers used by the audit engine. Strict TDD — tests first.

- [ ] **Step 1: Write failing tests**

Create `tests/lib/curriculum/match.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

import {
  extractLevel,
  extractPrefix,
  matchWildcard,
  qualifiesForConstraints,
} from "@/lib/curriculum/match";

describe("matchWildcard", () => {
  it("matches GEX% prefix", () => {
    expect(matchWildcard("GEX1234", "GEX%")).toBe(true);
    expect(matchWildcard("GEX9999X", "GEX%")).toBe(true);
  });

  it("rejects non-matching prefix", () => {
    expect(matchWildcard("CS1010", "GEX%")).toBe(false);
    expect(matchWildcard("GEX", "GEX%")).toBe(true);    // prefix-only counts
  });

  it("treats pattern without % as exact match", () => {
    expect(matchWildcard("CS1010", "CS1010")).toBe(true);
    expect(matchWildcard("CS1010S", "CS1010")).toBe(false);
  });
});

describe("extractLevel", () => {
  it("returns the thousand of the first 4-digit run", () => {
    expect(extractLevel("CS1010")).toBe(1000);
    expect(extractLevel("CS3235")).toBe(3000);
    expect(extractLevel("MA1521")).toBe(1000);
    expect(extractLevel("CS5331")).toBe(5000);
    expect(extractLevel("IFS4205")).toBe(4000);
  });

  it("handles trailing letters", () => {
    expect(extractLevel("CS2030S")).toBe(2000);
    expect(extractLevel("CS1010X")).toBe(1000);
  });

  it("returns null for malformed codes", () => {
    expect(extractLevel("INVALID")).toBeNull();
    expect(extractLevel("")).toBeNull();
    expect(extractLevel("CS")).toBeNull();
  });
});

describe("extractPrefix", () => {
  it("returns alpha prefix before the first digit", () => {
    expect(extractPrefix("CS1010")).toBe("CS");
    expect(extractPrefix("IFS4205")).toBe("IFS");
    expect(extractPrefix("MA1521")).toBe("MA");
  });

  it("returns null for malformed codes", () => {
    expect(extractPrefix("1010")).toBeNull();
    expect(extractPrefix("")).toBeNull();
  });
});

describe("qualifiesForConstraints", () => {
  it("matches when prefix and level both pass", () => {
    expect(qualifiesForConstraints("CS3235", { prefix: ["CS"], level_min: 3000 })).toBe(true);
  });

  it("rejects when prefix matches but level too low", () => {
    expect(qualifiesForConstraints("CS1010", { prefix: ["CS"], level_min: 3000 })).toBe(false);
  });

  it("rejects when prefix mismatches", () => {
    expect(qualifiesForConstraints("MA3235", { prefix: ["CS", "IS"] })).toBe(false);
  });

  it("returns true when no constraints supplied", () => {
    expect(qualifiesForConstraints("ANY9999", {})).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/curriculum/match.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement helpers**

Create `lib/curriculum/match.ts`:

```typescript
import type { ModuleConstraints } from "@/lib/curriculum/types";

const LEVEL_RE = /^[A-Z]+(\d{4})/;
const PREFIX_RE = /^([A-Z]+)\d/;

export function matchWildcard(code: string, pattern: string): boolean {
  if (!pattern.endsWith("%")) {
    return code === pattern;
  }
  const prefix = pattern.slice(0, -1);
  return code.startsWith(prefix);
}

export function extractLevel(code: string): number | null {
  const match = code.match(LEVEL_RE);
  if (!match) return null;
  const firstDigit = match[1][0];
  return parseInt(firstDigit, 10) * 1000;
}

export function extractPrefix(code: string): string | null {
  const match = code.match(PREFIX_RE);
  return match ? match[1] : null;
}

export function qualifiesForConstraints(code: string, constraints: ModuleConstraints): boolean {
  if (constraints.prefix && constraints.prefix.length > 0) {
    const prefix = extractPrefix(code);
    if (!prefix || !constraints.prefix.includes(prefix)) return false;
  }
  if (constraints.level_min !== undefined) {
    const level = extractLevel(code);
    if (level === null || level < constraints.level_min) return false;
  }
  if (constraints.level_max !== undefined) {
    const level = extractLevel(code);
    if (level === null || level > constraints.level_max) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/curriculum/match.test.ts`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/curriculum/match.ts tests/lib/curriculum/match.test.ts
git commit -m "feat(curriculum): add match/level/prefix helpers"
```

---

## Task 5: Curriculum YAML — Information Security AY2024/25

**Files:**
- Create: `data/curricula/bcomp-isc-2024.yaml`

The single source of truth for the InfoSec audit. Curated by hand from `https://www.comp.nus.edu.sg/programmes/ug/isc/curr/`. Total = 160 MC (40 CC + 32 Foundation + 28 IS + 12 Breadth + 12 Math + 36 UE).

- [ ] **Step 1: Create the YAML**

Create `data/curricula/bcomp-isc-2024.yaml`:

```yaml
id: bcomp-isc-2024
name: "Bachelor of Computing in Information Security"
matriculation_year: 2024
total_mc: 160
source_url: "https://www.comp.nus.edu.sg/programmes/ug/isc/curr/"
source_fetched_at: "2026-05-01"

buckets:
  # --- Common Curriculum (40 MC) ---
  - id: cc-digital-literacy
    name: "Digital Literacy"
    mc: 4
    rule:
      kind: all_of
      modules: ["CS1010"]

  - id: cc-critique-expression
    name: "Critique and Expression"
    mc: 4
    rule:
      kind: wildcard
      pattern: "GEX%"

  - id: cc-cultures-connections
    name: "Cultures and Connections"
    mc: 4
    rule:
      kind: wildcard
      pattern: "GEC%"

  - id: cc-data-literacy
    name: "Data Literacy"
    mc: 4
    rule:
      kind: choose_n
      n: 1
      modules: ["GEA1000", "BT1101", "ST1131", "DSE1101"]

  - id: cc-singapore-studies
    name: "Singapore Studies"
    mc: 4
    rule:
      kind: wildcard
      pattern: "GES%"

  - id: cc-communities-engagement
    name: "Communities and Engagement"
    mc: 4
    rule:
      kind: wildcard
      pattern: "GEN%"

  - id: cc-computing-ethics
    name: "Computing Ethics"
    mc: 4
    rule:
      kind: all_of
      modules: ["IS1108"]

  - id: cc-id-cd
    name: "Interdisciplinary & Cross-Disciplinary Education"
    mc: 12
    notes: "Min 2 ID courses; max 1 CD course (Phase A: not auto-validated)"
    rule:
      kind: open

  # --- Computing Foundation (32 MC) ---
  - id: foundation
    name: "Computing Foundation"
    mc: 32
    rule:
      kind: all_of
      modules: ["CS1231S", "CS2030", "CS2040C", "CS2100", "CS2101", "CS2103T", "CS2105", "CS2106"]

  # --- Information Security (28 MC) ---
  - id: is-core-intro-and-sec
    name: "Information Security Core: CS2107 + CS3235"
    mc: 8
    rule:
      kind: all_of
      modules: ["CS2107", "CS3235"]

  - id: is-research-or-pair
    name: "Information Security: IFS4205 OR (CS4238 + IFS4103)"
    mc: 8
    rule:
      kind: or
      options:
        - label: "Research route"
          modules: ["IFS4205"]
        - label: "Pair route"
          modules: ["CS4238", "IFS4103"]

  - id: is-mgmt
    name: "Information Security Management"
    mc: 4
    rule:
      kind: all_of
      modules: ["IS4231"]

  - id: is-electives
    name: "Information Security Electives"
    mc: 8
    notes: "Choose 2 from the IS elective list. School-approved L4000+ also acceptable but not in spec."
    rule:
      kind: choose_n
      n: 2
      modules:
        - "CS4230"
        - "CS4236"
        - "MA4261"
        - "CS4238"
        - "CS4239"
        - "CS4257"
        - "CS4276"
        - "CS5231"
        - "CS5321"
        - "CS5322"
        - "CS5331"
        - "CS5332"
        - "IFS4101"
        - "IFS4102"
        - "IFS4103"
        - "IS4204"
        - "IS4233"
        - "IS4234"
        - "IS4238"
        - "IS4302"

  # --- Computing Breadth (12 MC) ---
  - id: breadth
    name: "Computing Breadth"
    mc: 12
    notes: "CS/IS L3000+ or CP-coded; min 6 MC industrial experience (not auto-validated in Phase A)"
    rule:
      kind: open
      constraints:
        prefix: ["CS", "IS", "CP"]
        level_min: 3000

  # --- Mathematics (12 MC) ---
  - id: math
    name: "Mathematics"
    mc: 12
    rule:
      kind: all_of
      modules: ["MA1521", "MA1522", "ST2334"]

  # --- Unrestricted Electives (36 MC) ---
  - id: ue
    name: "Unrestricted Electives"
    mc: 36
    notes: "Any modules; without A-level/H2 math, MA1301/X required"
    rule:
      kind: open
```

- [ ] **Step 2: Verify total adds up**

Run this one-liner to sum MC:
```bash
node -e "const y=require('js-yaml').load(require('fs').readFileSync('data/curricula/bcomp-isc-2024.yaml','utf8')); console.log(y.buckets.reduce((s,b)=>s+b.mc,0));"
```
Expected output: `160`

- [ ] **Step 3: Commit**

```bash
git add data/curricula/bcomp-isc-2024.yaml
git commit -m "feat(curriculum): add InfoSec AY2024/25 spec"
```

---

## Task 6: Implement curriculum YAML loader

**Files:**
- Create: `lib/curriculum/loader.ts`
- Create: `tests/lib/curriculum/loader.test.ts`

Reads a YAML file from `data/curricula/`, parses with `js-yaml`, validates required fields, returns typed `ProgramSpec`.

- [ ] **Step 1: Write failing test**

Create `tests/lib/curriculum/loader.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

import { loadProgramSpec } from "@/lib/curriculum/loader";

describe("loadProgramSpec", () => {
  it("loads InfoSec AY2024 spec from disk", async () => {
    const spec = await loadProgramSpec("bcomp-isc-2024");
    expect(spec.id).toBe("bcomp-isc-2024");
    expect(spec.total_mc).toBe(160);
    expect(spec.buckets.length).toBeGreaterThan(10);
    const totalDeclared = spec.buckets.reduce((s, b) => s + b.mc, 0);
    expect(totalDeclared).toBe(160);
  });

  it("throws when program id is unknown", async () => {
    await expect(loadProgramSpec("does-not-exist")).rejects.toThrow(/not found/i);
  });

  it("includes the InfoSec all_of foundation modules", async () => {
    const spec = await loadProgramSpec("bcomp-isc-2024");
    const foundation = spec.buckets.find((b) => b.id === "foundation");
    expect(foundation).toBeDefined();
    expect(foundation!.rule.kind).toBe("all_of");
    if (foundation!.rule.kind === "all_of") {
      expect(foundation!.rule.modules).toContain("CS1231S");
      expect(foundation!.rule.modules).toContain("CS2103T");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/curriculum/loader.test.ts`
Expected: FAIL — loader module not found.

- [ ] **Step 3: Implement loader**

Create `lib/curriculum/loader.ts`:

```typescript
import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import yaml from "js-yaml";

import type { ProgramSpec } from "@/lib/curriculum/types";

const CURRICULA_DIR = path.join(process.cwd(), "data", "curricula");

export async function loadProgramSpec(programId: string): Promise<ProgramSpec> {
  const filePath = path.join(CURRICULA_DIR, `${programId}.yaml`);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "ENOENT") {
      throw new Error(`Program spec not found: ${programId}`);
    }
    throw err;
  }
  const parsed = yaml.load(raw) as ProgramSpec;
  validateSpec(parsed, programId);
  return parsed;
}

function validateSpec(spec: ProgramSpec, expectedId: string): void {
  if (!spec || typeof spec !== "object") {
    throw new Error(`Invalid spec for ${expectedId}: not an object`);
  }
  if (spec.id !== expectedId) {
    throw new Error(`Spec id mismatch: file ${expectedId} declares ${spec.id}`);
  }
  if (typeof spec.total_mc !== "number" || spec.total_mc <= 0) {
    throw new Error(`Spec ${expectedId} has invalid total_mc`);
  }
  if (!Array.isArray(spec.buckets) || spec.buckets.length === 0) {
    throw new Error(`Spec ${expectedId} has no buckets`);
  }
  const declaredTotal = spec.buckets.reduce((s, b) => s + b.mc, 0);
  if (declaredTotal !== spec.total_mc) {
    throw new Error(
      `Spec ${expectedId} total_mc (${spec.total_mc}) does not match sum of buckets (${declaredTotal})`,
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/curriculum/loader.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/curriculum/loader.ts tests/lib/curriculum/loader.test.ts
git commit -m "feat(curriculum): add YAML spec loader with validation"
```

---

## Task 7: Implement audit engine core

**Files:**
- Create: `lib/curriculum/audit.ts`
- Create: `tests/lib/curriculum/audit.test.ts`

The pure-function evaluator. Greedy bucket assignment in spec order; OR rules use whole-branch matching; wildcards / open buckets resolved via `match.ts`.

- [ ] **Step 1: Write failing tests covering the rule kinds**

Create `tests/lib/curriculum/audit.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

import { auditDegree } from "@/lib/curriculum/audit";
import type { ProgramSpec, TakenModule } from "@/lib/curriculum/types";

const taken = (
  code: string,
  mc: number,
  status: TakenModule["status"] = "completed",
  bucket_override: string | null = null,
): TakenModule => ({ code, mc, status, bucket_override });

const baseSpec: ProgramSpec = {
  id: "test-prog",
  name: "Test Program",
  matriculation_year: 2024,
  total_mc: 28,
  source_url: "https://example/curr",
  source_fetched_at: "2026-05-01",
  buckets: [
    { id: "core", name: "Core", mc: 8, rule: { kind: "all_of", modules: ["CS1010", "CS2030"] } },
    { id: "math", name: "Math", mc: 4, rule: { kind: "all_of", modules: ["MA1521"] } },
    { id: "ge", name: "GE", mc: 4, rule: { kind: "wildcard", pattern: "GEX%" } },
    { id: "elective", name: "Elective", mc: 8, rule: { kind: "choose_n", n: 2, modules: ["CS3235", "CS4238", "CS4257"] } },
    { id: "ue", name: "UE", mc: 4, rule: { kind: "open" } },
  ],
};

describe("auditDegree", () => {
  it("zero progress when no takings", () => {
    const result = auditDegree(baseSpec, []);
    expect(result.totalMc.current).toBe(0);
    expect(result.totalMc.required).toBe(28);
    expect(result.willGraduate).toBe(false);
    expect(result.buckets.every((b) => b.status === "not_started")).toBe(true);
  });

  it("counts all_of modules into the right bucket", () => {
    const result = auditDegree(baseSpec, [taken("CS1010", 4), taken("CS2030", 4)]);
    const core = result.buckets.find((b) => b.id === "core")!;
    expect(core.current).toBe(8);
    expect(core.status).toBe("complete");
    expect(core.fulfilling.map((t) => t.code).sort()).toEqual(["CS1010", "CS2030"]);
  });

  it("counts wildcard matches", () => {
    const result = auditDegree(baseSpec, [taken("GEX1006", 4)]);
    const ge = result.buckets.find((b) => b.id === "ge")!;
    expect(ge.current).toBe(4);
    expect(ge.status).toBe("complete");
  });

  it("caps choose_n at the required mc", () => {
    const result = auditDegree(baseSpec, [
      taken("CS3235", 4),
      taken("CS4238", 4),
      taken("CS4257", 4),
    ]);
    const elec = result.buckets.find((b) => b.id === "elective")!;
    expect(elec.current).toBe(8);
    expect(elec.raw).toBe(12);
  });

  it("places extra choose_n into UE", () => {
    const result = auditDegree(baseSpec, [
      taken("CS3235", 4),
      taken("CS4238", 4),
      taken("CS4257", 4),
    ]);
    const ue = result.buckets.find((b) => b.id === "ue")!;
    expect(ue.current).toBe(4);
  });

  it("respects bucket_override", () => {
    const result = auditDegree(baseSpec, [
      taken("CS3235", 4, "completed", "ue"),
      taken("CS4238", 4),
    ]);
    const ue = result.buckets.find((b) => b.id === "ue")!;
    expect(ue.fulfilling.map((t) => t.code)).toContain("CS3235");
    const elec = result.buckets.find((b) => b.id === "elective")!;
    expect(elec.fulfilling.map((t) => t.code)).not.toContain("CS3235");
  });

  it("declares willGraduate true when all buckets complete", () => {
    const result = auditDegree(baseSpec, [
      taken("CS1010", 4),
      taken("CS2030", 4),
      taken("MA1521", 4),
      taken("GEX1006", 4),
      taken("CS3235", 4),
      taken("CS4238", 4),
      taken("UE0001", 4),
    ]);
    expect(result.totalMc.current).toBe(28);
    expect(result.willGraduate).toBe(true);
    expect(result.blockers).toEqual([]);
  });

  it("OR rule: branch A satisfies", () => {
    const orSpec: ProgramSpec = {
      ...baseSpec,
      total_mc: 8,
      buckets: [
        {
          id: "or-bucket",
          name: "OR",
          mc: 8,
          rule: {
            kind: "or",
            options: [
              { modules: ["IFS4205"], label: "research" },
              { modules: ["CS4238", "IFS4103"], label: "pair" },
            ],
          },
        },
      ],
    };
    const result = auditDegree(orSpec, [taken("IFS4205", 8)]);
    const b = result.buckets[0];
    expect(b.current).toBe(8);
    expect(b.status).toBe("complete");
  });

  it("OR rule: branch B satisfies (both modules required)", () => {
    const orSpec: ProgramSpec = {
      ...baseSpec,
      total_mc: 8,
      buckets: [
        {
          id: "or-bucket",
          name: "OR",
          mc: 8,
          rule: {
            kind: "or",
            options: [
              { modules: ["IFS4205"], label: "research" },
              { modules: ["CS4238", "IFS4103"], label: "pair" },
            ],
          },
        },
      ],
    };
    const partial = auditDegree(orSpec, [taken("CS4238", 4)]);
    expect(partial.buckets[0].status).toBe("not_started");

    const full = auditDegree(orSpec, [taken("CS4238", 4), taken("IFS4103", 4)]);
    expect(full.buckets[0].current).toBe(8);
    expect(full.buckets[0].status).toBe("complete");
  });

  it("open rule with constraints accepts only matching prefix and level", () => {
    const openSpec: ProgramSpec = {
      ...baseSpec,
      total_mc: 8,
      buckets: [
        {
          id: "breadth",
          name: "Breadth",
          mc: 8,
          rule: { kind: "open", constraints: { prefix: ["CS", "IS"], level_min: 3000 } },
        },
      ],
    };
    const result = auditDegree(openSpec, [
      taken("CS3235", 4),
      taken("CS1010", 4),       // wrong level
      taken("MA3000", 4),       // wrong prefix
    ]);
    expect(result.buckets[0].current).toBe(4);
    expect(result.buckets[0].fulfilling.map((t) => t.code)).toEqual(["CS3235"]);
  });

  it("ignores dropped status", () => {
    const result = auditDegree(baseSpec, [taken("CS1010", 4, "dropped")]);
    expect(result.buckets.find((b) => b.id === "core")!.current).toBe(0);
  });

  it("counts in_progress toward current MC (lenient)", () => {
    const result = auditDegree(baseSpec, [taken("CS1010", 4, "in_progress")]);
    expect(result.buckets.find((b) => b.id === "core")!.current).toBe(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/curriculum/audit.test.ts`
Expected: FAIL — audit module not found.

- [ ] **Step 3: Implement audit engine**

Create `lib/curriculum/audit.ts`:

```typescript
import {
  qualifiesForConstraints,
  matchWildcard,
} from "@/lib/curriculum/match";
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
    const raw = fulfilling.reduce((s, t) => s + t.mc, 0);
    const current = Math.min(raw, b.mc);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/curriculum/audit.test.ts`
Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/curriculum/audit.ts tests/lib/curriculum/audit.test.ts
git commit -m "feat(curriculum): add audit engine (greedy + OR + open rules)"
```

---

## Task 8: Implement suggestion helper

**Files:**
- Create: `lib/curriculum/suggest.ts`
- Create: `tests/lib/curriculum/suggest.test.ts`

For each bucket with `missing > 0`, generate up to N module suggestions the student could take. Reads from a catalog (passed in) — does not hit the DB.

- [ ] **Step 1: Write failing tests**

Create `tests/lib/curriculum/suggest.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

import type { Bucket, TakenModule } from "@/lib/curriculum/types";
import { suggestModulesForBucket } from "@/lib/curriculum/suggest";

const catalog = [
  { code: "CS3235", title: "Computer Security", mc: 4 },
  { code: "CS4238", title: "Computer Security Practice", mc: 4 },
  { code: "CS4239", title: "Software Security", mc: 4 },
  { code: "CS1010", title: "Programming Methodology", mc: 4 },
  { code: "GEX1006", title: "Argumentation", mc: 4 },
  { code: "MA3236", title: "Non-Linear Algebra", mc: 4 },
];

describe("suggestModulesForBucket", () => {
  it("returns up to N modules from a choose_n list, excluding already-taken", () => {
    const bucket: Bucket = {
      id: "elec",
      name: "Electives",
      mc: 8,
      rule: { kind: "choose_n", n: 2, modules: ["CS3235", "CS4238", "CS4239"] },
    };
    const taken: TakenModule[] = [
      { code: "CS3235", mc: 4, status: "completed", bucket_override: null },
    ];
    const suggestions = suggestModulesForBucket(bucket, taken, catalog, 5);
    expect(suggestions.map((s) => s.code)).toEqual(["CS4238", "CS4239"]);
  });

  it("returns all_of missing modules", () => {
    const bucket: Bucket = {
      id: "core",
      name: "Core",
      mc: 8,
      rule: { kind: "all_of", modules: ["CS1010", "CS3235"] },
    };
    const taken: TakenModule[] = [];
    const suggestions = suggestModulesForBucket(bucket, taken, catalog, 5);
    expect(suggestions.map((s) => s.code).sort()).toEqual(["CS1010", "CS3235"]);
  });

  it("returns wildcard catalog matches up to N", () => {
    const bucket: Bucket = {
      id: "ge",
      name: "GE",
      mc: 4,
      rule: { kind: "wildcard", pattern: "GEX%" },
    };
    const suggestions = suggestModulesForBucket(bucket, [], catalog, 5);
    expect(suggestions.map((s) => s.code)).toEqual(["GEX1006"]);
  });

  it("returns open-rule catalog matches respecting constraints", () => {
    const bucket: Bucket = {
      id: "breadth",
      name: "Breadth",
      mc: 12,
      rule: { kind: "open", constraints: { prefix: ["CS"], level_min: 3000 } },
    };
    const suggestions = suggestModulesForBucket(bucket, [], catalog, 5);
    expect(suggestions.map((s) => s.code).sort()).toEqual(["CS3235", "CS4238", "CS4239"]);
  });

  it("returns empty array for OR rules in Phase A", () => {
    const bucket: Bucket = {
      id: "or-bucket",
      name: "OR",
      mc: 8,
      rule: {
        kind: "or",
        options: [
          { modules: ["IFS4205"] },
          { modules: ["CS4238", "IFS4103"] },
        ],
      },
    };
    expect(suggestModulesForBucket(bucket, [], catalog, 5)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/curriculum/suggest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement suggestion helper**

Create `lib/curriculum/suggest.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/curriculum/suggest.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Wire suggestions into audit result**

Modify `lib/curriculum/audit.ts` — at the bottom of the file, add an export wrapper that injects suggestions:

```typescript
import { suggestModulesForBucket, type CatalogEntry } from "@/lib/curriculum/suggest";

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
```

- [ ] **Step 6: Commit**

```bash
git add lib/curriculum/suggest.ts tests/lib/curriculum/suggest.test.ts lib/curriculum/audit.ts
git commit -m "feat(curriculum): add module suggestion helper + audit wrapper"
```

---

## Task 9: NUSMods catalog cache

**Files:**
- Create: `lib/nus-catalog.ts`
- Create: `tests/lib/nus-catalog.test.ts`

Lazy fetcher: given a list of module codes, ensure each has a row in `nus_modules`. Hit NUSMods API for missing ones, parse, persist. Bulk-fetched module summaries from `moduleList.json` provide titles for unfetched modules without per-module API calls.

- [ ] **Step 1: Write failing tests**

Create `tests/lib/nus-catalog.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFromBuilder = () => {
  const single = vi.fn();
  const inIn = vi.fn(() => ({ data: [], error: null }));
  const select = vi.fn(() => ({ in: inIn, single }));
  const upsert = vi.fn(() => ({ data: null, error: null }));
  return { single, inIn, select, upsert };
};

const fromMock = vi.fn();

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: () => ({ from: fromMock }),
}));

import { ensureCatalog } from "@/lib/nus-catalog";

describe("ensureCatalog", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("does no work when all codes are already cached", async () => {
    const builder = mockFromBuilder();
    builder.inIn.mockReturnValue({ data: [{ code: "CS1010" }, { code: "CS2030" }], error: null });
    fromMock.mockReturnValue(builder);
    const fetchMock = vi.fn();

    await ensureCatalog(["CS1010", "CS2030"], fetchMock);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches missing codes from NUSMods and upserts", async () => {
    const builder = mockFromBuilder();
    builder.inIn.mockReturnValue({ data: [{ code: "CS1010" }], error: null });
    fromMock.mockReturnValue(builder);
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("CS3235")) {
        return new Response(
          JSON.stringify({
            moduleCode: "CS3235",
            title: "Computer Security",
            moduleCredit: "4",
            faculty: "Computing",
            department: "Computer Science",
            description: "Security topics.",
            semesterData: [{ semester: 2 }],
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    });

    await ensureCatalog(["CS1010", "CS3235"], fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(builder.upsert).toHaveBeenCalled();
    const payload = builder.upsert.mock.calls[0][0];
    expect(payload.code).toBe("CS3235");
    expect(payload.mc).toBe(4);
    expect(payload.level).toBe(3000);
    expect(payload.prefix).toBe("CS");
  });

  it("tolerates 404 for a single module without throwing", async () => {
    const builder = mockFromBuilder();
    builder.inIn.mockReturnValue({ data: [], error: null });
    fromMock.mockReturnValue(builder);
    const fetchMock = vi.fn(async () => new Response("not found", { status: 404 }));

    await expect(ensureCatalog(["NONEXISTENT0000"], fetchMock)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/nus-catalog.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement nus-catalog**

Create `lib/nus-catalog.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/nus-catalog.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/nus-catalog.ts tests/lib/nus-catalog.test.ts
git commit -m "feat(catalog): lazy NUSMods catalog cache"
```

---

## Task 10: Auto-link Canvas courses to module_takings

**Files:**
- Modify: `lib/sync.ts`

When `upsertCourse` runs (existing function in sync.ts), also upsert a `module_takings` row with `status='in_progress'` if one doesn't exist. The existing `inferModuleCode` function already extracts the module code from Canvas course names.

- [ ] **Step 1: Locate `upsertCourse` and study its return**

Read `lib/sync.ts` around line 142 (the `upsertCourse` function). Confirm the function returns a `CourseRow` with `code`. The next steps modify the surrounding flow, not `upsertCourse` itself.

- [ ] **Step 2: Add a helper function near `upsertCourse`**

In `lib/sync.ts`, add this helper right after the existing `upsertCourse` function:

```typescript
async function ensureModuleTaking(userId: string, code: string | null) {
  if (!code) return;
  const supabase = getSupabaseAdminClient();
  const { data: existing } = await supabase
    .from("module_takings")
    .select("id, status")
    .eq("user_id", userId)
    .eq("module_code", code)
    .maybeSingle();
  if (existing) return;   // don't overwrite user-set status
  await supabase.from("module_takings").insert({
    user_id: userId,
    module_code: code,
    status: "in_progress",
  });
}
```

- [ ] **Step 3: Wire the helper into `runDiscoverySync` after `upsertCourse`**

Find `runDiscoverySync` (around line 781). Inside its for-loop where each course is upserted, add a call right after `upsertedCourses.push(courseRow);`:

```typescript
  for (const course of courses) {
    const courseRow = await upsertCourse(user.id, course);
    upsertedCourses.push(courseRow);
    await ensureModuleTaking(user.id, courseRow.code);
    void fetchNUSModsModule(courseRow.code ?? "");
  }
```

- [ ] **Step 4: Run the existing sync tests to ensure nothing regressed**

Run: `npx vitest run tests/lib/sync.test.ts tests/lib/sync-assignment.test.ts`
Expected: all existing sync tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/sync.ts
git commit -m "feat(sync): auto-create module_takings when canvas course is synced"
```

---

## Task 11: Module-takings API route

**Files:**
- Create: `app/api/module-takings/route.ts`
- Create: `tests/app/api/module-takings.test.ts`

GET returns the demo user's takings; POST upserts one (status / bucket_override / grade); DELETE removes by `module_code`.

- [ ] **Step 1: Write failing tests**

Create `tests/app/api/module-takings.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const orderEq = vi.fn();
const insertOrUpsert = vi.fn(() => ({ data: null, error: null }));
const deleteEq = vi.fn(() => ({ data: null, error: null }));
const fromMock = vi.fn(() => ({
  select: () => ({ eq: () => ({ order: orderEq }) }),
  upsert: insertOrUpsert,
  delete: () => ({ eq: () => ({ eq: deleteEq }) }),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: () => ({ from: fromMock }),
}));
vi.mock("@/lib/demo-user", () => ({
  ensureDemoUser: async () => ({ id: "user-1", email: "x", last_synced_at: null }),
}));

import { GET, POST, DELETE } from "@/app/api/module-takings/route";

describe("/api/module-takings", () => {
  beforeEach(() => {
    orderEq.mockReset();
    insertOrUpsert.mockClear();
    deleteEq.mockClear();
  });

  it("GET returns the user's takings", async () => {
    orderEq.mockReturnValue({
      data: [
        { id: "t1", module_code: "CS3235", status: "completed", bucket_override: null, grade: "A" },
      ],
      error: null,
    });
    const res = await GET(new Request("http://x/api/module-takings"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.takings).toHaveLength(1);
    expect(json.takings[0].module_code).toBe("CS3235");
  });

  it("POST upserts a taking", async () => {
    const body = JSON.stringify({ module_code: "CS3235", status: "completed", grade: "A" });
    const res = await POST(new Request("http://x/api/module-takings", { method: "POST", body }));
    expect(res.status).toBe(200);
    expect(insertOrUpsert).toHaveBeenCalled();
    const payload = insertOrUpsert.mock.calls[0][0];
    expect(payload.module_code).toBe("CS3235");
    expect(payload.status).toBe("completed");
  });

  it("POST rejects invalid status", async () => {
    const body = JSON.stringify({ module_code: "CS3235", status: "bogus" });
    const res = await POST(new Request("http://x/api/module-takings", { method: "POST", body }));
    expect(res.status).toBe(400);
  });

  it("DELETE removes by module_code", async () => {
    const body = JSON.stringify({ module_code: "CS3235" });
    const res = await DELETE(new Request("http://x/api/module-takings", { method: "DELETE", body }));
    expect(res.status).toBe(200);
    expect(deleteEq).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/app/api/module-takings.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the route**

Create `app/api/module-takings/route.ts`:

```typescript
export const dynamic = "force-dynamic";

import { ensureDemoUser } from "@/lib/demo-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const VALID_STATUSES = new Set(["completed", "in_progress", "planning", "dropped"]);

export async function GET(_request: Request) {
  const user = await ensureDemoUser();
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("module_takings")
    .select("id, module_code, status, semester, grade, bucket_override")
    .eq("user_id", user.id)
    .order("module_code", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ takings: data ?? [] });
}

export async function POST(request: Request) {
  const user = await ensureDemoUser();
  const body = (await request.json()) as {
    module_code?: string;
    status?: string;
    semester?: string | null;
    grade?: string | null;
    bucket_override?: string | null;
  };
  if (!body.module_code || typeof body.module_code !== "string") {
    return Response.json({ error: "module_code required" }, { status: 400 });
  }
  if (!body.status || !VALID_STATUSES.has(body.status)) {
    return Response.json({ error: "invalid status" }, { status: 400 });
  }
  const payload = {
    user_id: user.id,
    module_code: body.module_code,
    status: body.status,
    semester: body.semester ?? null,
    grade: body.grade ?? null,
    bucket_override: body.bucket_override ?? null,
    updated_at: new Date().toISOString(),
  };
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("module_takings").upsert(payload, {
    onConflict: "user_id,module_code",
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await ensureDemoUser();
  const body = (await request.json()) as { module_code?: string };
  if (!body.module_code) return Response.json({ error: "module_code required" }, { status: 400 });
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("module_takings")
    .delete()
    .eq("user_id", user.id)
    .eq("module_code", body.module_code);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/app/api/module-takings.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add app/api/module-takings/route.ts tests/app/api/module-takings.test.ts
git commit -m "feat(api): module-takings GET/POST/DELETE"
```

---

## Task 12: Audit API route

**Files:**
- Create: `app/api/audit/route.ts`

Glues everything: load the user's program (or default to `bcomp-isc-2024`), load takings, ensure catalog covers referenced modules, run audit. Returns `AuditResult`.

- [ ] **Step 1: Implement the route**

Create `app/api/audit/route.ts`:

```typescript
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

  await ensureCatalog([...new Set([...codes, ...collectReferencedCodes(spec)])]);
  const catalog = await loadCatalog([...new Set([...codes, ...collectReferencedCodes(spec)])]);
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
```

- [ ] **Step 2: Smoke test in dev server**

If dev server is running, `curl http://localhost:3000/api/audit` should return JSON with `programId: "bcomp-isc-2024"`, `totalMc: { current, required: 160 }`, and a `buckets` array. Even with zero takings, the call should succeed (all buckets `not_started`).

- [ ] **Step 3: Commit**

```bash
git add app/api/audit/route.ts
git commit -m "feat(api): audit endpoint glues catalog + takings + spec"
```

---

## Task 13: Progress view component

**Files:**
- Create: `app/ui/progress/progress-view.tsx`
- Create: `app/ui/progress/bucket-card.tsx`
- Create: `tests/app/ui/progress/progress-view.test.tsx`

Renders an `AuditResult`. The view is a server-friendly client component that fetches `/api/audit` on mount, shows a top summary, then a list of `<BucketCard>` instances.

- [ ] **Step 1: Write failing test**

Create `tests/app/ui/progress/progress-view.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

import { ProgressView } from "@/app/ui/progress/progress-view";

describe("ProgressView", () => {
  it("fetches and renders bucket cards", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            programId: "bcomp-isc-2024",
            programName: "BComp Information Security",
            totalMc: { current: 12, required: 160 },
            buckets: [
              {
                id: "foundation",
                name: "Computing Foundation",
                required: 32,
                current: 12,
                raw: 12,
                status: "in_progress",
                fulfilling: [
                  { code: "CS1010", mc: 4, status: "completed", bucket_override: null },
                  { code: "CS1231S", mc: 4, status: "completed", bucket_override: null },
                  { code: "CS2030", mc: 4, status: "in_progress", bucket_override: null },
                ],
                missing: 20,
                suggestions: [{ code: "CS2040C", title: "Data Structures", mc: 4 }],
              },
            ],
            blockers: ["Missing 20 MC in Computing Foundation"],
            warnings: [],
            willGraduate: false,
          }),
          { status: 200 },
        ),
      ),
    );
    render(<ProgressView />);
    await waitFor(() => {
      expect(screen.getByText("Computing Foundation")).toBeInTheDocument();
    });
    expect(screen.getByText(/12 \/ 32/)).toBeInTheDocument();
    expect(screen.getByText("CS1010")).toBeInTheDocument();
    expect(screen.getByText("CS2040C")).toBeInTheDocument();
  });

  it("shows error state on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 })),
    );
    render(<ProgressView />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/ui/progress/progress-view.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement BucketCard**

Create `app/ui/progress/bucket-card.tsx`:

```typescript
"use client";

import type { BucketResult } from "@/lib/curriculum/types";

export function BucketCard({ bucket }: { bucket: BucketResult }) {
  const pct = Math.min(100, Math.round((bucket.current / bucket.required) * 100));
  const statusColor =
    bucket.status === "complete" ? "bg-emerald-500" : bucket.status === "in_progress" ? "bg-amber-500" : "bg-stone-300";

  return (
    <section className="rounded-[10px] border border-stone-200 bg-white px-4 py-4">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-stone-900">{bucket.name}</h3>
        <span className="text-[11px] text-stone-500">
          {bucket.current} / {bucket.required} MC
        </span>
      </header>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
        <div className={`h-full ${statusColor}`} style={{ width: `${pct}%` }} />
      </div>
      {bucket.fulfilling.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {bucket.fulfilling.map((t) => (
            <li
              key={t.code}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                t.status === "completed"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {t.code}
            </li>
          ))}
        </ul>
      ) : null}
      {bucket.suggestions.length > 0 ? (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Suggestions</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {bucket.suggestions.map((s) => (
              <li
                key={s.code}
                title={s.title}
                className="rounded-full border border-stone-200 px-2 py-0.5 text-[10px] font-medium text-stone-700"
              >
                {s.code}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 4: Implement ProgressView**

Create `app/ui/progress/progress-view.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";

import type { AuditResult } from "@/lib/curriculum/types";

import { BucketCard } from "./bucket-card";

type LoadState =
  | { kind: "idle" }
  | { kind: "ready"; audit: AuditResult }
  | { kind: "error"; message: string };

export function ProgressView() {
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  useEffect(() => {
    if (state.kind !== "idle") return;
    let cancelled = false;
    fetch("/api/audit")
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error", message: json.error ?? "Failed to load audit" });
          return;
        }
        setState({ kind: "ready", audit: json as AuditResult });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: "error", message: err instanceof Error ? err.message : "Failed to load" });
      });
    return () => {
      cancelled = true;
    };
  }, [state.kind]);

  if (state.kind === "idle") return <p className="text-sm text-stone-500">Loading audit…</p>;
  if (state.kind === "error") return <p className="text-sm text-rose-700">Failed to load audit: {state.message}</p>;

  const { audit } = state;
  const pct = Math.round((audit.totalMc.current / audit.totalMc.required) * 100);

  return (
    <div className="space-y-4">
      <section className="rounded-[12px] border border-stone-200 bg-white px-5 py-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">Progress</p>
        <h2 className="mt-2 font-[var(--font-lora)] text-[24px] font-medium tracking-[-0.02em] text-stone-950">
          {audit.programName}
        </h2>
        <div className="mt-4 flex items-baseline gap-3">
          <span className="text-2xl font-semibold text-stone-900">
            {audit.totalMc.current} / {audit.totalMc.required} MC
          </span>
          <span className="text-sm text-stone-500">{pct}% to graduation</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
          <div
            className={`h-full ${audit.willGraduate ? "bg-emerald-500" : "bg-amber-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {audit.willGraduate ? (
          <p className="mt-3 text-sm font-medium text-emerald-700">On track to graduate.</p>
        ) : (
          <p className="mt-3 text-sm text-stone-500">{audit.blockers.length} bucket(s) remaining.</p>
        )}
      </section>
      <div className="grid gap-3 lg:grid-cols-2">
        {audit.buckets.map((b) => (
          <BucketCard key={b.id} bucket={b} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/app/ui/progress/progress-view.test.tsx`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add app/ui/progress/ tests/app/ui/progress/
git commit -m "feat(ui): Progress view with bucket cards"
```

---

## Task 14: Add tab structure to NUSMods view

**Files:**
- Modify: `app/ui/dashboard/nusmods-view.tsx`

Add a 3-tab strip: **Current Sem** (existing content), **Progress** (new ProgressView), **Planning** (stub).

- [ ] **Step 1: Replace nusmods-view.tsx**

The existing `nusmods-view.tsx` content moves into a `CurrentSemTab` block. Add tab state and a tab strip above the content.

Replace the entire body of `app/ui/dashboard/nusmods-view.tsx`:

```typescript
"use client";

import { useState } from "react";

import type { ModuleSummary, WeeklyTask } from "@/lib/contracts";

import { EmptyState, Pill, SectionCard } from "./shared";
import { ScheduleBoard } from "./widgets/schedule-board";
import { ProgressView } from "@/app/ui/progress/progress-view";

type NUSModsTab = "current-sem" | "progress" | "planning";

const TABS: Array<{ id: NUSModsTab; label: string }> = [
  { id: "current-sem", label: "Current sem" },
  { id: "progress", label: "Progress" },
  { id: "planning", label: "Planning" },
];

export function NUSModsView({
  modules,
  tasks,
}: {
  modules: ModuleSummary[];
  tasks: WeeklyTask[];
}) {
  const [tab, setTab] = useState<NUSModsTab>("current-sem");
  const [weekOffset, setWeekOffset] = useState(0);
  const syncedModules = modules.filter((module) => module.sync_enabled);

  return (
    <div className="space-y-4">
      <section className="rounded-[12px] border border-stone-200 bg-white px-5 py-5 shadow-[0_10px_28px_rgba(28,25,23,0.05)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">NUSMods</p>
        <h1 className="mt-2 font-[var(--font-lora)] text-[28px] font-medium tracking-[-0.03em] text-stone-950">
          Timetable, progress, and planning.
        </h1>
        <div role="tablist" aria-label="NUSMods sections" className="mt-4 flex border-b border-stone-200">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-[12px] font-medium ${
                tab === t.id ? "border-b-2 border-stone-900 text-stone-950" : "text-stone-500"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {tab === "current-sem" ? (
        <>
          <SectionCard title="Weekly timetable" eyebrow="Lesson grid">
            {syncedModules.length === 0 ? (
              <EmptyState title="No synced modules" copy="Exam data will appear here once modules are enabled and synced." />
            ) : (
              <ScheduleBoard modules={syncedModules} tasks={tasks} weekOffset={weekOffset} onWeekOffsetChange={setWeekOffset} compact={true} />
            )}
          </SectionCard>
          <SectionCard title="Exam schedule" eyebrow="Assessment timing">
            {syncedModules.length === 0 ? (
              <EmptyState title="No exam data yet" copy="Enable modules and sync first." />
            ) : (
              <div className="space-y-2">
                {syncedModules.map((module) => (
                  <div key={module.id} className="flex flex-col gap-3 rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone="blue">{module.code}</Pill>
                        {module.nusmods?.mc ? <Pill>{module.nusmods.mc} MCs</Pill> : null}
                      </div>
                      <p className="mt-2 text-[13px] font-medium text-stone-900">{module.title}</p>
                    </div>
                    <div className="text-left lg:text-right">
                      <p className="text-[13px] font-medium text-stone-900">{module.nusmods?.exam.date ?? "No exam data"}</p>
                      <p className="mt-1 text-[11px] text-stone-500">
                        {module.nusmods?.exam.time ?? "—"} · {module.nusmods?.exam.venue ?? "Venue unavailable"} · {module.nusmods?.exam.duration ?? "—"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </>
      ) : null}

      {tab === "progress" ? <ProgressView /> : null}

      {tab === "planning" ? (
        <SectionCard title="Planning" eyebrow="Coming in Phase B">
          <EmptyState
            title="Planning is not built yet"
            copy="Phase B will let you shortlist modules for next semester with prereq + exam-clash awareness."
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run --reporter=basic`
Expected: All tests pass (existing + new from Task 13). If any existing test for the NUSMods view fails, update it to match the new tab structure.

- [ ] **Step 3: Commit**

```bash
git add app/ui/dashboard/nusmods-view.tsx
git commit -m "feat(ui): 3-tab structure in NUSMods view (current sem / progress / planning)"
```

---

## Task 15: Final integration check

**Files:**
- None (verification only)

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 new errors (pre-existing test-globals noise unchanged).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 4: Browser smoke test**

With dev server running and migration 0010 applied:

1. Open http://localhost:3000
2. Sync a course (creates auto-`module_takings` row)
3. Click into NUSMods tab in the dashboard
4. Click the "Progress" tab — `ProgressView` loads
5. Verify the audit shows: total MC progress bar at the top, all 16 bucket cards below, with the synced module(s) appearing in the correct bucket (CS1010 → Digital Literacy, CS2030 → Foundation, etc.)
6. Open Supabase SQL Editor and insert a few completed modules to test more buckets:
   ```sql
   insert into module_takings (user_id, module_code, status) values
     ((select id from users limit 1), 'CS1231S', 'completed'),
     ((select id from users limit 1), 'CS2103T', 'completed'),
     ((select id from users limit 1), 'MA1521', 'completed'),
     ((select id from users limit 1), 'CS2107', 'completed');
   ```
   Refresh the page → verify those modules now appear in their buckets and the total MC moves up.
7. Click the "Planning" tab — verify the "Coming in Phase B" empty state.
8. Click "Current sem" — verify the existing weekly timetable + exam schedule still render.

- [ ] **Step 5: Commit any integration fixes**

```bash
git add <fixed files>
git commit -m "fix: integration regressions from degree audit phase A"
```

---

## Self-Review Notes

**Spec coverage:**
- Audit engine (greedy + OR + open + wildcard + choose_n + all_of): Tasks 4, 7
- Curriculum spec for InfoSec AY24: Task 5
- Spec loader + validation: Task 6
- Module catalog + lazy fetch: Task 9
- Auto-link Canvas → takings: Task 10
- API: takings (Task 11), audit (Task 12)
- UI: Progress view + bucket cards (Task 13), tab structure (Task 14)
- Schema: Task 1

**Deferred (documented in plan, not in scope):**
- Crawlers for NUS faculty pages — Phase B
- Multi-major support — Phase B
- Planning tab implementation — Phase B (stub only)
- Year-of-matriculation versioning — Phase B
- Industrial-experience sub-rule auto-validation inside Breadth — Phase B
- Level-cap constraint (`min 80% of major MC at L1000-4000`) — Phase B
- Crowdsourced spec contributions — Phase C
- AI-driven module suggestions — Phase C

**Manual steps required:**
- Migration 0009 must be applied before plan execution starts (pre-existing requirement from prior plan).
- Migration 0010 from Task 1 Step 2 must be applied during execution.

**Known limitations of Phase A:**
- ID/CD distinction in `cc-id-cd` is not enforced — bucket accepts any 12 MC for now.
- Honours dissertation (CP4101) substitution rule is not modelled.
- Constraints object (level cap, S/U cap) is not enforced — Phase B.
- Single program only (`bcomp-isc-2024`).
