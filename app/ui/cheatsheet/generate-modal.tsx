// app/ui/cheatsheet/generate-modal.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type ModalFile = {
  id: string;
  filename: string;
  week_number: number | null;
  uploaded_at: string | null;
};

export function GenerateModal({
  open,
  onClose,
  courseId,
  files,
}: {
  open: boolean;
  onClose: () => void;
  courseId: string;
  files: ModalFile[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/cheatsheets/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          course_id: courseId,
          source_file_ids: [...selected],
          title: title.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Failed to start: ${(body as { error?: string })?.error ?? res.status}`);
        setSubmitting(false);
        return;
      }
      const id = res.headers.get("x-cheatsheet-id");
      if (!id) {
        alert("Server did not return cheatsheet id");
        setSubmitting(false);
        return;
      }
      onClose();
      router.push(`/cheatsheets/${id}/generating`);

      // Pump remaining SSE chunks to the generating page via a window event.
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const last = buffer.lastIndexOf("\n\n");
        if (last < 0) continue;
        const ready = buffer.slice(0, last + 2);
        buffer = buffer.slice(last + 2);
        window.dispatchEvent(
          new CustomEvent("cheatsheet-sse-chunk", { detail: { id, raw: ready } }),
        );
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Generate cheatsheet</h2>
        <p className="text-sm text-gray-500">Pick the files to include.</p>
        <div className="mt-4 max-h-72 overflow-auto rounded border">
          {files.map((f) => (
            <label
              key={f.id}
              className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0"
            >
              <input
                type="checkbox"
                checked={selected.has(f.id)}
                onChange={() => toggle(f.id)}
                aria-label={f.filename}
              />
              <span>{f.filename}</span>
              {f.week_number ? (
                <span className="ml-auto text-xs text-gray-500">Week {f.week_number}</span>
              ) : null}
            </label>
          ))}
        </div>
        <input
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-4 w-full rounded border px-3 py-2 text-sm"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={selected.size === 0 || submitting}
            className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {submitting ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
