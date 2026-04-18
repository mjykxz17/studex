"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { ChatResponse, ChatSource } from "@/lib/contracts";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type ChatPanelProps = {
  moduleId?: string | null;
  activeModule: string;
  suggestedPrompts: string[];
  initialMessages: ChatMessage[];
  compact?: boolean;
};

export function ChatPanel({
  moduleId = null,
  activeModule,
  suggestedPrompts,
  initialMessages,
  compact = false,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const initialMessagesRef = useRef(initialMessages);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => Boolean(draft.trim()) && !isSending, [draft, isSending]);
  const scopeKey = `${moduleId ?? "global"}:${activeModule}`;
  const initialMessageSignature = initialMessages.map((message) => `${message.id}:${message.role}:${message.content}`).join("|");

  useEffect(() => {
    initialMessagesRef.current = initialMessages;
  }, [initialMessages]);

  useEffect(() => {
    setMessages(initialMessagesRef.current);
    setDraft("");
    setError(null);
    setSources([]);
    setLastPrompt(null);
  }, [scopeKey, initialMessageSignature]);

  useEffect(() => {
    if (!transcriptRef.current) {
      return;
    }

    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [isSending, messages]);

  async function submitMessage(rawPrompt?: string, options?: { reuseLastUserMessage?: boolean }) {
    const prompt = (rawPrompt ?? draft).trim();

    if (!prompt || isSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: prompt,
    };

    if (!options?.reuseLastUserMessage) {
      setMessages((current) => [...current, userMessage]);
    }
    setDraft("");
    setIsSending(true);
    setError(null);
    setSources([]);
    setLastPrompt(prompt);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: prompt,
          moduleId,
        }),
      });

      const payload = (await response.json().catch(() => null)) as ChatResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Chat failed.");
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: payload?.answer || "No answer returned.",
      };

      setMessages((current) => [...current, assistantMessage]);
      setSources(payload?.sources ?? []);
    } catch (chatError) {
      setSources([]);
      setError(chatError instanceof Error ? chatError.message : "Chat failed.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[12px] border border-stone-200 bg-white shadow-[0_10px_28px_rgba(28,25,23,0.05)]">
      <div className="flex items-center justify-between gap-3 border-b border-stone-200 bg-[#fcfbf9] px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">Ask Studex</p>
          <p className="mt-1 text-[11px] text-stone-500">Grounded in synced files, tasks, and announcements.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-full bg-[linear-gradient(135deg,#6366f1,#8b5cf6)] text-xs text-white">✦</div>
          <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-stone-600">
            {activeModule}
          </span>
        </div>
      </div>

      <div
        ref={transcriptRef}
        aria-live="polite"
        className={`overflow-auto bg-stone-950 px-3 py-3 font-mono ${compact ? "max-h-[220px]" : "max-h-[280px]"}`}
      >
        <div className="space-y-2">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[90%] whitespace-pre-wrap rounded-[11px] px-3 py-2 text-[12.5px] leading-6 ${
                  message.role === "user"
                    ? "rounded-br-[4px] bg-stone-100 text-stone-950"
                    : "rounded-bl-[4px] bg-[#27272a] text-stone-100"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}
          {isSending ? (
            <div className="flex justify-start">
              <div className="rounded-[11px] rounded-bl-[4px] bg-[#27272a] px-3 py-2 text-[12.5px] tracking-[0.3em] text-stone-400">
                ...
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-t border-stone-200 px-3 py-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => {
                setDraft(prompt);
                setError(null);
              }}
              disabled={isSending}
              className="shrink-0 rounded-full border border-stone-200 bg-transparent px-3 py-1.5 text-[10.5px] text-stone-600 transition hover:border-stone-300 hover:text-stone-900"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {sources.length > 0 ? (
        <div className="border-t border-stone-200 bg-[#fcfbf9] px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">Latest sources</p>
            <p className="text-[10px] text-stone-400">{sources.length} matched</p>
          </div>
          <div className="mt-2 space-y-2">
            {sources.map((source) => (
              <div key={`${source.id}-${source.sourceType}`} className="rounded-[8px] border border-stone-200 bg-white px-3 py-3">
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-stone-400">
                  <span className="rounded-full bg-stone-900 px-2 py-1 font-semibold text-white">{source.moduleCode}</span>
                  <span>{source.sourceType}</span>
                  <span>{source.similarity.toFixed(3)}</span>
                </div>
                <p className="mt-2 text-[12.5px] font-semibold text-stone-900">{source.label}</p>
                <p className="mt-1 text-[12px] leading-5 text-stone-600">{source.excerpt}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <form
        className="border-t border-stone-200 px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submitMessage();
        }}
      >
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-[8px] border border-stone-300 bg-white px-3 py-2 text-[12.5px] text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500"
            placeholder="Ask about a lecture, announcement, file, or what is due this week…"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            disabled={isSending}
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={!canSend}
            className="grid h-9 w-9 place-items-center rounded-[8px] bg-stone-950 text-sm font-semibold text-white disabled:opacity-60"
          >
            →
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <p className={`text-[10.5px] leading-5 ${error ? "text-rose-600" : "text-stone-400"}`}>
            {error ?? "If synced content does not support the answer, Studex should say so."}
          </p>
          {error && lastPrompt ? (
            <button
              type="button"
              onClick={() => void submitMessage(lastPrompt, { reuseLastUserMessage: true })}
              className="shrink-0 rounded-[7px] border border-stone-200 bg-white px-2.5 py-1.5 text-[10.5px] font-medium text-stone-600"
            >
              Retry
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
