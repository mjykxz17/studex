"use client";

import { useEffect, useState } from "react";

import type { AuditResult } from "@/lib/curriculum/types";

import { BucketCard } from "./bucket-card";
import { ModuleTakingsEditor } from "./module-takings-editor";

type LoadState =
  | { kind: "idle" }
  | { kind: "ready"; audit: AuditResult }
  | { kind: "error"; message: string };

export function ProgressView() {
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/audit")
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error", message: json.error ?? "Failed to load audit" });
          return;
        }
        setState({ kind: "ready", audit: json as AuditResult });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Failed to load",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [refetchTrigger]);

  const refetchAudit = () => setRefetchTrigger((n) => n + 1);

  if (state.kind === "idle") {
    return <p className="text-sm text-stone-500">Loading audit…</p>;
  }
  if (state.kind === "error") {
    return <p className="text-sm text-rose-700">Failed to load audit: {state.message}</p>;
  }

  const { audit } = state;
  const pct = Math.round((audit.totalMc.current / audit.totalMc.required) * 100);

  return (
    <div className="space-y-4">
      <section className="rounded-[12px] border border-stone-200 bg-white px-5 py-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">Progress</p>
        <h2 className="mt-2 font-[var(--font-lora)] text-[24px] font-medium tracking-[-0.02em] text-stone-950">
          {audit.programName}
        </h2>
        <div className="mt-4 flex items-baseline gap-3">
          <span className="text-2xl font-semibold text-stone-900">
            {audit.totalMc.current} / {audit.totalMc.required} MC
          </span>
          <span className="text-sm text-stone-500">{pct}% to graduation</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
          <div
            className={`h-full ${audit.willGraduate ? "bg-emerald-500" : "bg-amber-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {audit.willGraduate ? (
          <p className="mt-3 text-sm font-medium text-emerald-700">On track to graduate.</p>
        ) : (
          <p className="mt-3 text-sm text-stone-500">{audit.blockers.length} bucket(s) remaining.</p>
        )}
      </section>
      <div className="grid gap-3 lg:grid-cols-2">
        {audit.buckets.map((b) => (
          <BucketCard key={b.id} bucket={b} />
        ))}
      </div>
      <ModuleTakingsEditor onChange={refetchAudit} />
    </div>
  );
}
