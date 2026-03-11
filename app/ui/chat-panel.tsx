"use client";

import { useMemo, useState } from "react";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type ChatSource = {
  id: string;
  sourceType: string;
  similarity: number;
  excerpt: string;
};

type ChatResponse = {
  answer?: string;
  error?: string;
  sources?: ChatSource[];
};

export function ChatPanel({
  userId,
  activeModule,
  suggestedPrompts,
  initialMessages,
}: {
  userId: string | null;
  activeModule: string;
  suggestedPrompts: string[];
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<ChatSource[]>([]);

  const canSend = useMemo(() => Boolean(draft.trim()) && !isSending && Boolean(userId), [draft, isSending, userId]);

  async function submitMessage(messageText: string) {
    const trimmed = messageText.trim();
    if (!trimmed || isSending || !userId) {
      if (!userId) {
        setError("Run the first sync before using AI chat. Phase 1 chat needs the local user row created by /api/sync.");
      }
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setIsSending(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: trimmed,
          userId,
        }),
      });

      const payload = (await response.json()) as ChatResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Chat failed.");
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: payload.answer || "No answer returned.",
      };

      setMessages((current) => [...current, assistantMessage]);
      setSources(payload.sources ?? []);
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Chat failed.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,255,0.98))] shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200/70 px-5 py-5 sm:px-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">Action queue</p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">AI study chat</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Phase 1 MVP transport is live. Answers come from <code>/api/chat</code> and cite synced chunks when available.
          </p>
        </div>
      </div>

      <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
        <div className="rounded-[22px] border border-emerald-100 bg-emerald-50/90 p-4 text-sm text-emerald-900">
          Active scope: <span className="font-semibold">{activeModule}</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => {
                setDraft(prompt);
                setError(null);
              }}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-300"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="mt-5 max-h-[420px] space-y-3 overflow-auto pr-1">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[92%] rounded-[22px] px-4 py-3 text-sm leading-7 ${
                message.role === "assistant"
                  ? "bg-slate-100 text-slate-700"
                  : "ml-auto bg-slate-950 text-white"
              }`}
            >
              {message.content}
            </div>
          ))}
          {isSending ? (
            <div className="max-w-[92%] rounded-[22px] bg-slate-100 px-4 py-3 text-sm leading-7 text-slate-500">
              Thinking over your synced material…
            </div>
          ) : null}
        </div>

        {sources.length > 0 ? (
          <div className="mt-4 rounded-[22px] border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Latest sources</p>
            <div className="mt-3 space-y-3">
              {sources.map((source) => (
                <div key={`${source.id}-${source.sourceType}`} className="rounded-2xl bg-slate-50 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-slate-200 px-2 py-1 font-semibold text-slate-700">
                      {source.sourceType}
                    </span>
                    <span>similarity {source.similarity.toFixed(3)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{source.excerpt}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <form
          className="mt-5 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitMessage(draft);
          }}
        >
          <textarea
            className="min-h-32 w-full resize-none rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-70"
            placeholder={
              userId
                ? "Ask about a lecture, announcement, or what is due this week…"
                : "Run sync first so chat has a Phase 1 user row and real course context."
            }
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={!userId || isSending}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className={`text-xs leading-5 ${error ? "text-rose-600" : "text-slate-500"}`}>
              {error ??
                (userId
                  ? "If the answer is not in synced context, the model should say so instead of guessing."
                  : "Clear placeholder: chat is blocked until the first sync creates your local Phase 1 user and stored content.")}
            </p>
            <button
              type="submit"
              disabled={!canSend}
              className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {isSending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
