// lib/cheatsheet/synthesize.ts
import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { SONNET_MODEL } from "@/lib/llm/anthropic";
import type { Citation, IngestedFile, SearchResult } from "@/lib/cheatsheet/types";

const SYSTEM = `You are an academic cheatsheet author. Produce a concise, dense, exam-ready cheatsheet in Markdown from the provided source materials and supporting external snippets.

Format requirements:
- Use \`#\` and \`##\` headings to structure topics.
- Use bullet points and tight prose. Aim for 1-2 printed pages worth of content.
- When you state a fact that came from one of the SUPPORTING SNIPPETS, append a citation marker like [1], [2], etc., matching the order of snippets given.
- Facts that came from the source materials need NO citation.
- Do NOT include a sources list at the bottom — that is appended programmatically.`;

function buildUserPrompt(files: IngestedFile[], searchResults: SearchResult[]): string {
  const sources = files
    .filter((f) => !f.skipped)
    .map((f, i) => `## SOURCE ${i + 1}: ${f.name}\n${f.markdown}`)
    .join("\n\n");

  const numbered: Array<{
    n: number;
    url: string;
    title: string;
    snippet: string;
    concept: string;
  }> = [];
  let n = 1;
  for (const r of searchResults) {
    if (r.failed) continue;
    for (const s of r.snippets) {
      numbered.push({ n, url: s.url, title: s.title, snippet: s.snippet, concept: r.gap.concept });
      n++;
    }
  }

  const supporting = numbered.length
    ? numbered.map((x) => `[${x.n}] ${x.title} (${x.url})\n${x.snippet}`).join("\n\n")
    : "(none)";

  return [
    `=== SOURCE MATERIALS ===\n${sources}`,
    `=== SUPPORTING SNIPPETS (cite by number) ===\n${supporting}`,
    `\nWrite the cheatsheet now.`,
  ].join("\n\n");
}

export type SynthesizeParams = {
  files: IngestedFile[];
  searchResults: SearchResult[];
  client: Anthropic;
  onChunk?: (chunk: string) => void;
};

export type SynthesizeResult = {
  markdown: string;
  citations: Citation[];
  tokensIn: number;
  tokensOut: number;
};

export async function synthesizeCheatsheet(
  params: SynthesizeParams,
): Promise<SynthesizeResult> {
  // Build the citation index up-front so we can return it (matches the order
  // synthesize was told to use).
  const citations: Citation[] = [];
  let n = 1;
  for (const r of params.searchResults) {
    if (r.failed) continue;
    for (const s of r.snippets) {
      citations.push({
        n,
        url: s.url,
        title: s.title,
        snippet: s.snippet,
        gap_concept: r.gap.concept,
      });
      n++;
    }
  }

  const stream = params.client.messages.stream({
    model: SONNET_MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{ role: "user", content: buildUserPrompt(params.files, params.searchResults) }],
  });

  let markdown = "";
  let tokensIn = 0;
  let tokensOut = 0;

  for await (const event of stream as unknown as AsyncIterable<{
    type: string;
    message?: { usage?: { input_tokens?: number; output_tokens?: number } };
    delta?: { type?: string; text?: string };
    usage?: { input_tokens?: number; output_tokens?: number };
  }>) {
    if (
      event.type === "content_block_delta" &&
      event.delta?.type === "text_delta" &&
      event.delta.text
    ) {
      markdown += event.delta.text;
      params.onChunk?.(event.delta.text);
    } else if (event.type === "message_start" && event.message?.usage) {
      tokensIn = event.message.usage.input_tokens ?? tokensIn;
    } else if (event.type === "message_delta" && event.usage) {
      tokensOut = event.usage.output_tokens ?? tokensOut;
    }
  }

  return { markdown, citations, tokensIn, tokensOut };
}
