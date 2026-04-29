// lib/cheatsheet/orchestrate.ts
import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { ingestFiles } from "@/lib/cheatsheet/ingest";
import { detectGaps, type DetectGapsResult } from "@/lib/cheatsheet/detect-gaps";
import { searchGaps, type SearchGapsResult } from "@/lib/cheatsheet/search";
import { synthesizeCheatsheet, type SynthesizeResult } from "@/lib/cheatsheet/synthesize";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  Citation,
  CheatsheetStage,
  IngestedFile,
  StreamEvent,
} from "@/lib/cheatsheet/types";

export type Pipeline = {
  ingest: (params: { fileIds: string[] }) => Promise<IngestedFile[]>;
  detectGaps: (params: { sourceMarkdown: string; client: Anthropic }) => Promise<DetectGapsResult>;
  searchGaps: (params: {
    gaps: DetectGapsResult["gaps"];
    userId: string;
  }) => Promise<SearchGapsResult>;
  synthesize: (params: {
    files: IngestedFile[];
    searchResults: SearchGapsResult["results"];
    client: Anthropic;
    onChunk?: (chunk: string) => void;
  }) => Promise<SynthesizeResult>;
  persist: (params: {
    cheatsheetId: string;
    markdown: string;
    citations: Citation[];
    status: "complete" | "failed";
    failureReason?: string;
  }) => Promise<void>;
  recordRun: (params: {
    cheatsheetId: string;
    stage: CheatsheetStage;
    startedAt: string;
    completedAt: string;
    tokensIn?: number;
    tokensOut?: number;
    metadata?: Record<string, unknown>;
    error?: string;
  }) => Promise<void>;
};

export type OrchestratorParams = {
  cheatsheetId: string;
  userId: string;
  sourceFileIds: string[];
  anthropic: Anthropic;
  emit: (ev: StreamEvent) => void;
  pipeline?: Partial<Pipeline>;
};

const defaultPipeline: Pipeline = {
  ingest: ({ fileIds }) => ingestFiles({ fileIds }),
  detectGaps: ({ sourceMarkdown, client }) => detectGaps({ sourceMarkdown, client }),
  searchGaps: ({ gaps, userId }) => searchGaps({ gaps, userId }),
  synthesize: (p) => synthesizeCheatsheet(p),
  persist: async ({ cheatsheetId, markdown, citations, status, failureReason }) => {
    const supabase = getSupabaseAdminClient();
    await supabase
      .from("cheatsheets")
      .update({
        markdown,
        citations,
        status,
        failure_reason: failureReason ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", cheatsheetId);
  },
  recordRun: async (params) => {
    const supabase = getSupabaseAdminClient();
    await supabase.from("cheatsheet_runs").insert({
      cheatsheet_id: params.cheatsheetId,
      stage: params.stage,
      started_at: params.startedAt,
      completed_at: params.completedAt,
      tokens_in: params.tokensIn,
      tokens_out: params.tokensOut,
      metadata: params.metadata,
      error: params.error,
    });
  },
};

export async function runOrchestrator(
  params: OrchestratorParams,
): Promise<{ status: "complete" | "failed"; reason?: string }> {
  const pipeline: Pipeline = { ...defaultPipeline, ...params.pipeline } as Pipeline;
  const { emit } = params;

  let currentStage: CheatsheetStage = "ingest";
  let currentStageStart = new Date().toISOString();

  try {
    // Stage 1: Ingest
    const ingestStart = currentStageStart;
    emit({
      type: "stage-start",
      stage: "ingest",
      message: `Parsing ${params.sourceFileIds.length} files…`,
    });
    const files = await pipeline.ingest({ fileIds: params.sourceFileIds });
    const usable = files.filter((f) => !f.skipped && f.markdown.length > 0);
    if (usable.length === 0) {
      const reason = "No files could be parsed (all skipped or empty)";
      emit({ type: "failed", reason });
      await pipeline.persist({
        cheatsheetId: params.cheatsheetId,
        markdown: "",
        citations: [],
        status: "failed",
        failureReason: reason,
      });
      await pipeline.recordRun({
        cheatsheetId: params.cheatsheetId,
        stage: "ingest",
        startedAt: ingestStart,
        completedAt: new Date().toISOString(),
        error: reason,
      });
      return { status: "failed", reason };
    }
    for (const f of files) {
      if (f.skipped) {
        emit({ type: "warning", message: `Skipped ${f.name}: ${f.skipped.reason}` });
      }
    }
    emit({
      type: "stage-complete",
      stage: "ingest",
      data: { parsed: usable.length, skipped: files.length - usable.length },
    });
    await pipeline.recordRun({
      cheatsheetId: params.cheatsheetId,
      stage: "ingest",
      startedAt: ingestStart,
      completedAt: new Date().toISOString(),
      metadata: { parsed: usable.length, skipped: files.length - usable.length },
    });

    // Stage 2: Detect gaps
    currentStage = "detect-gaps";
    currentStageStart = new Date().toISOString();
    const gapsStart = currentStageStart;
    emit({ type: "stage-start", stage: "detect-gaps", message: "Identifying gap concepts…" });
    const sourceMarkdown = usable.map((f) => `## ${f.name}\n${f.markdown}`).join("\n\n");
    const gaps = await pipeline.detectGaps({ sourceMarkdown, client: params.anthropic });
    if (gaps.degraded) {
      emit({ type: "warning", message: "Gap detection failed; proceeding without enrichment" });
    }
    emit({
      type: "stage-complete",
      stage: "detect-gaps",
      data: { gaps: gaps.gaps.map((g) => g.concept) },
    });
    await pipeline.recordRun({
      cheatsheetId: params.cheatsheetId,
      stage: "detect-gaps",
      startedAt: gapsStart,
      completedAt: new Date().toISOString(),
      tokensIn: gaps.tokensIn,
      tokensOut: gaps.tokensOut,
      metadata: { degraded: gaps.degraded, gap_count: gaps.gaps.length },
    });

    // Stage 3: Web search
    currentStage = "web-search";
    currentStageStart = new Date().toISOString();
    const searchStart = currentStageStart;
    emit({
      type: "stage-start",
      stage: "web-search",
      message: `Searching for ${gaps.gaps.length} concept(s)…`,
    });
    const search = await pipeline.searchGaps({ gaps: gaps.gaps, userId: params.userId });
    if (search.degraded) {
      emit({ type: "warning", message: search.reason ?? "Web search unavailable" });
    }
    emit({
      type: "stage-complete",
      stage: "web-search",
      data: {
        successful: search.results.filter((r) => !r.failed).length,
        failed: search.results.filter((r) => r.failed).length,
      },
    });
    await pipeline.recordRun({
      cheatsheetId: params.cheatsheetId,
      stage: "web-search",
      startedAt: searchStart,
      completedAt: new Date().toISOString(),
      metadata: {
        degraded: search.degraded,
        reason: search.reason,
        failed_searches: search.results.filter((r) => r.failed).map((r) => r.gap.concept),
      },
    });

    // Stage 4: Synthesize
    currentStage = "synthesize";
    currentStageStart = new Date().toISOString();
    const synthStart = currentStageStart;
    emit({ type: "stage-start", stage: "synthesize", message: "Writing cheatsheet…" });
    const synth = await pipeline.synthesize({
      files: usable,
      searchResults: search.results,
      client: params.anthropic,
      onChunk: (c) => emit({ type: "markdown-chunk", chunk: c }),
    });
    emit({ type: "stage-complete", stage: "synthesize" });
    await pipeline.recordRun({
      cheatsheetId: params.cheatsheetId,
      stage: "synthesize",
      startedAt: synthStart,
      completedAt: new Date().toISOString(),
      tokensIn: synth.tokensIn,
      tokensOut: synth.tokensOut,
    });

    // Persist final cheatsheet
    await pipeline.persist({
      cheatsheetId: params.cheatsheetId,
      markdown: synth.markdown,
      citations: synth.citations,
      status: "complete",
    });
    emit({ type: "complete", cheatsheet_id: params.cheatsheetId });
    return { status: "complete" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error";
    emit({ type: "failed", reason });
    // Audit the failing stage so we have a debuggable run row.
    await pipeline.recordRun({
      cheatsheetId: params.cheatsheetId,
      stage: currentStage,
      startedAt: currentStageStart,
      completedAt: new Date().toISOString(),
      error: reason,
    });
    await pipeline.persist({
      cheatsheetId: params.cheatsheetId,
      markdown: "",
      citations: [],
      status: "failed",
      failureReason: reason,
    });
    return { status: "failed", reason };
  }
}
