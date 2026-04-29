// lib/cheatsheet/types.ts
export type CheatsheetStage = "ingest" | "detect-gaps" | "web-search" | "synthesize";

export type CheatsheetStatus = "streaming" | "complete" | "failed";

export type IngestedFile = {
  id: string;
  name: string;
  markdown: string;
  skipped?: { reason: string };
};

export type GapConcept = {
  concept: string;
  why_unclear: string;
};

export type SearchResult = {
  gap: GapConcept;
  snippets: Array<{ url: string; title: string; snippet: string }>;
  failed: boolean;
};

export type Citation = {
  n: number;
  url: string;
  title: string;
  snippet: string;
  gap_concept: string;
};

export type Cheatsheet = {
  id: string;
  user_id: string;
  course_id: string;
  title: string;
  source_file_ids: string[];
  markdown: string | null;
  citations: Citation[] | null;
  status: CheatsheetStatus;
  failure_reason: string | null;
  created_at: string;
  completed_at: string | null;
};

export type StreamEvent =
  | { type: "stage-start"; stage: CheatsheetStage; message: string }
  | { type: "stage-progress"; stage: CheatsheetStage; message: string; data?: unknown }
  | { type: "stage-complete"; stage: CheatsheetStage; data?: unknown }
  | { type: "markdown-chunk"; chunk: string }
  | { type: "warning"; message: string }
  | { type: "complete"; cheatsheet_id: string }
  | { type: "failed"; reason: string };
