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
