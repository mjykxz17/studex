// lib/cheatsheet/ingest.ts
import "server-only";

import { PDFParse } from "pdf-parse";

import { downloadCanvasFile } from "@/lib/canvas";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { IngestedFile } from "@/lib/cheatsheet/types";

export async function extractPdfMarkdown(buf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    const raw = (result?.text ?? "").trim();
    if (!raw) {
      throw new Error("PDF contained no extractable text (likely scanned)");
    }
    return raw.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  } finally {
    await parser.destroy();
  }
}

export type IngestParams = {
  fileIds: string[];
};

type CanvasFileRow = {
  id: string;
  filename: string | null;
  canvas_file_id: string | null;
  extracted_text: string | null;
  processed: boolean | null;
};

export async function ingestFiles(params: IngestParams): Promise<IngestedFile[]> {
  const supabase = getSupabaseAdminClient();
  const { data: rows, error } = await supabase
    .from("canvas_files")
    .select("id, filename, canvas_file_id, extracted_text, processed")
    .in("id", params.fileIds);
  if (error) throw new Error(`Failed to load files: ${error.message}`);

  const out: IngestedFile[] = [];
  for (const row of (rows ?? []) as CanvasFileRow[]) {
    const id = row.id;
    const name = row.filename ?? "unnamed";

    if (row.processed && typeof row.extracted_text === "string" && row.extracted_text.length > 0) {
      out.push({ id, name, markdown: row.extracted_text });
      continue;
    }

    if (!row.canvas_file_id) {
      out.push({ id, name, markdown: "", skipped: { reason: "missing canvas_file_id" } });
      continue;
    }

    try {
      const downloaded = await downloadCanvasFile(row.canvas_file_id);
      if (!downloaded) {
        out.push({ id, name, markdown: "", skipped: { reason: "file not found in Canvas" } });
        continue;
      }
      const buf = Buffer.from(await downloaded.response.arrayBuffer());
      const markdown = await extractPdfMarkdown(buf);
      await supabase
        .from("canvas_files")
        .update({ extracted_text: markdown, processed: true })
        .eq("id", id);
      out.push({ id, name, markdown });
    } catch (err) {
      out.push({
        id,
        name,
        markdown: "",
        skipped: { reason: err instanceof Error ? err.message : "unknown error" },
      });
    }
  }
  return out;
}
