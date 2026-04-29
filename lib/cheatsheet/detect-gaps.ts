// lib/cheatsheet/detect-gaps.ts
import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { HAIKU_MODEL } from "@/lib/llm/anthropic";
import type { GapConcept } from "@/lib/cheatsheet/types";

const SYSTEM = `You are an academic gap detector. You read course material and identify specific terms or concepts that are mentioned but not adequately explained — definitions a student would need to look up to understand the lecture.

Output ONLY valid JSON matching this schema:
{ "gaps": [ { "concept": string, "why_unclear": string } ] }

Rules:
- Maximum 8 gaps. Pick the highest-value ones.
- Skip terms that ARE adequately defined in the source.
- "concept" should be a precise search term (e.g. "Dijkstra's algorithm", not "the algorithm").
- "why_unclear" is one sentence explaining what's missing from the source.`;

export type DetectGapsParams = {
  sourceMarkdown: string;
  client: Anthropic;
};

export type DetectGapsResult = {
  gaps: GapConcept[];
  tokensIn: number;
  tokensOut: number;
  degraded: boolean;
};

async function callOnce(params: DetectGapsParams): Promise<{
  text: string;
  tokensIn: number;
  tokensOut: number;
}> {
  const res = await params.client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `<source>\n${params.sourceMarkdown}\n</source>\n\nReturn only the JSON object.`,
      },
    ],
  });
  const text = (res.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("");
  return {
    text,
    tokensIn: res.usage?.input_tokens ?? 0,
    tokensOut: res.usage?.output_tokens ?? 0,
  };
}

function tryParse(text: string): GapConcept[] | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as { gaps?: GapConcept[] };
    if (!parsed?.gaps || !Array.isArray(parsed.gaps)) return null;
    return parsed.gaps
      .filter(
        (g): g is GapConcept =>
          typeof g?.concept === "string" && typeof g?.why_unclear === "string",
      )
      .slice(0, 8);
  } catch {
    return null;
  }
}

export async function detectGaps(params: DetectGapsParams): Promise<DetectGapsResult> {
  let totalIn = 0;
  let totalOut = 0;

  const first = await callOnce(params);
  totalIn += first.tokensIn;
  totalOut += first.tokensOut;
  const firstParsed = tryParse(first.text);
  if (firstParsed) {
    return { gaps: firstParsed, tokensIn: totalIn, tokensOut: totalOut, degraded: false };
  }

  const second = await callOnce(params);
  totalIn += second.tokensIn;
  totalOut += second.tokensOut;
  const secondParsed = tryParse(second.text);
  if (secondParsed) {
    return { gaps: secondParsed, tokensIn: totalIn, tokensOut: totalOut, degraded: false };
  }

  return { gaps: [], tokensIn: totalIn, tokensOut: totalOut, degraded: true };
}
