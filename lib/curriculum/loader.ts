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
