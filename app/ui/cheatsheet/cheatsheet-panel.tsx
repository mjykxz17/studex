// app/ui/cheatsheet/cheatsheet-panel.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { GenerateModal, type ModalFile } from "@/app/ui/cheatsheet/generate-modal";

export type CheatsheetSummary = {
  id: string;
  title: string;
  status: "streaming" | "complete" | "failed";
  created_at: string;
};

export function CheatsheetPanel({
  courseId,
  files,
}: {
  courseId: string;
  files: ModalFile[];
}) {
  const [open, setOpen] = useState(false);
  const [cheatsheets, setCheatsheets] = useState<CheatsheetSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cheatsheets?course_id=${encodeURIComponent(courseId)}`)
      .then((res) => (res.ok ? res.json() : { cheatsheets: [] }))
      .then((body) => {
        if (cancelled) return;
        setCheatsheets((body?.cheatsheets ?? []) as CheatsheetSummary[]);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCheatsheets([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  return (
    <section className="rounded border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Cheatsheets</h2>
        <button
          onClick={() => setOpen(true)}
          className="rounded bg-black px-3 py-1.5 text-sm text-white"
        >
          + Generate cheatsheet
        </button>
      </div>
      <ul className="mt-3 divide-y">
        {loading ? (
          <li className="py-3 text-sm text-gray-500">Loading…</li>
        ) : cheatsheets.length === 0 ? (
          <li className="py-3 text-sm text-gray-500">No cheatsheets yet.</li>
        ) : (
          cheatsheets.map((c) => (
            <li key={c.id} className="py-2">
              <Link
                href={c.status === "complete" ? `/cheatsheets/${c.id}` : `/cheatsheets/${c.id}/generating`}
                className="text-sm text-blue-700 hover:underline"
              >
                {c.title}
              </Link>
              <span className="ml-2 text-xs text-gray-500">
                {new Date(c.created_at).toLocaleString()} · {c.status}
              </span>
            </li>
          ))
        )}
      </ul>
      <GenerateModal open={open} onClose={() => setOpen(false)} courseId={courseId} files={files} />
    </section>
  );
}
