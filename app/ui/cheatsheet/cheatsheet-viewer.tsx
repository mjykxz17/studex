// app/ui/cheatsheet/cheatsheet-viewer.tsx
"use client";

import ReactMarkdown from "react-markdown";

import type { Citation } from "@/lib/cheatsheet/types";

export type ViewerCheatsheet = {
  id: string;
  title: string;
  markdown: string | null;
  citations: Citation[] | null;
  status: "streaming" | "complete" | "failed";
  failure_reason?: string | null;
};

export function CheatsheetViewer({ cheatsheet }: { cheatsheet: ViewerCheatsheet }) {
  if (cheatsheet.status === "failed") {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        <p className="font-semibold">Generation failed</p>
        <p className="mt-1">{cheatsheet.failure_reason ?? "Unknown error"}</p>
      </div>
    );
  }
  return (
    <article className="prose max-w-3xl">
      <p className="text-2xl font-bold">{cheatsheet.title}</p>
      <ReactMarkdown>{cheatsheet.markdown ?? ""}</ReactMarkdown>
      {cheatsheet.citations && cheatsheet.citations.length > 0 ? (
        <section className="mt-8 border-t pt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Sources</h2>
          <ol className="mt-2 space-y-2 text-sm">
            {cheatsheet.citations.map((c) => (
              <li key={c.n}>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-700 underline"
                >
                  [{c.n}] {c.title}
                </a>
                <span className="ml-2 text-gray-500">— {c.gap_concept}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </article>
  );
}
