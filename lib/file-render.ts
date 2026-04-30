import "server-only";

import mammoth from "mammoth";

import { sanitizeHtml } from "@/lib/sanitize";

export async function renderDocxToHtml(buf: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer: buf });
  return sanitizeHtml(result.value);
}
