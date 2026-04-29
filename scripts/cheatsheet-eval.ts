// scripts/cheatsheet-eval.ts
// Manual prompt-quality eval. Runs the real pipeline against user-supplied PDFs.
// Costs real Anthropic + Tavily tokens. Use during prompt iteration.
//
// Usage:
//   npm run cheatsheet:eval -- --files /path/to/lecture-1.pdf /path/to/lecture-2.pdf

import "dotenv/config";
import { readFileSync } from "node:fs";

import { extractPdfMarkdown } from "@/lib/cheatsheet/ingest";
import { detectGaps } from "@/lib/cheatsheet/detect-gaps";
import { searchGaps } from "@/lib/cheatsheet/search";
import { synthesizeCheatsheet } from "@/lib/cheatsheet/synthesize";
import { getAnthropicClient } from "@/lib/llm/anthropic";

async function main() {
  const fileArgIdx = process.argv.indexOf("--files");
  if (fileArgIdx < 0) {
    console.error("Usage: npm run cheatsheet:eval -- --files <pdf-path> [<pdf-path>...]");
    process.exit(1);
  }
  const filePaths = process.argv.slice(fileArgIdx + 1);
  if (filePaths.length === 0) {
    console.error("Error: --files requires at least one PDF path.");
    process.exit(1);
  }

  console.log(`Reading ${filePaths.length} PDF(s)…`);
  const files = await Promise.all(
    filePaths.map(async (p) => ({
      id: p,
      name: p,
      markdown: await extractPdfMarkdown(readFileSync(p)),
    })),
  );
  const sourceMd = files.map((f) => `## ${f.name}\n${f.markdown}`).join("\n\n");
  const client = getAnthropicClient();

  console.log("\n--- Detected gaps ---");
  const gaps = await detectGaps({ sourceMarkdown: sourceMd, client });
  for (const g of gaps.gaps) console.log(`• ${g.concept} — ${g.why_unclear}`);
  console.log(
    `(degraded=${gaps.degraded}, tokensIn=${gaps.tokensIn}, tokensOut=${gaps.tokensOut})`,
  );

  console.log("\n--- Search results ---");
  const search = await searchGaps({
    gaps: gaps.gaps,
    userId: "eval-script",
    incrementUsage: async () => ({ allowed: true, remaining: 999 }),
  });
  for (const r of search.results) {
    console.log(
      `• ${r.gap.concept}: ${r.failed ? "FAILED" : `${r.snippets.length} snippets`}`,
    );
  }

  console.log("\n--- Synthesized cheatsheet ---");
  const synth = await synthesizeCheatsheet({
    files,
    searchResults: search.results,
    client,
    onChunk: (c) => process.stdout.write(c),
  });
  console.log("\n\n--- Citations ---");
  for (const c of synth.citations) console.log(`[${c.n}] ${c.title} — ${c.url}`);
  console.log(`\n(tokensIn=${synth.tokensIn}, tokensOut=${synth.tokensOut})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
