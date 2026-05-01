type ClassValue = string | number | false | null | undefined;

export function cn(...args: ClassValue[]): string {
  return args.filter((a): a is string => typeof a === "string" && a.length > 0).join(" ");
}
