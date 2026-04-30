"use client";

import { useEffect, useState } from "react";

import type { AuditResult } from "@/lib/curriculum/types";

import { BucketCard } from "./bucket-card";
import { ModuleTakingsEditor } from "./module-takings-editor";
import { ProgramSelector } from "./program-selector";
import { Card } from "@/app/ui/primitives/card";
import { Container } from "@/app/ui/primitives/container";
import { DensitySelector } from "@/app/ui/primitives/density-selector";

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
    return (
      <Container>
        <p className="text-[var(--font-size-body)] text-[var(--color-fg-tertiary)]">Loading audit…</p>
      </Container>
    );
  }
  if (state.kind === "error") {
    return (
      <Container>
        <p className="text-[var(--font-size-body)] text-[var(--color-danger)]">
          Failed to load audit: {state.message}
        </p>
      </Container>
    );
  }

  const { audit } = state;
  const pct = Math.round((audit.totalMc.current / audit.totalMc.required) * 100);

  return (
    <Container>
      <div className="space-y-[var(--space-section-gap)]">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-fg-tertiary)]">
              Progress
            </p>
            <div className="flex items-center gap-2">
              <DensitySelector />
              <ProgramSelector onChange={refetchAudit} />
            </div>
          </div>
          <h2
            className="mt-2 font-semibold tracking-[-0.02em] text-[var(--color-fg-primary)]"
            style={{ fontSize: "var(--font-size-heading)", lineHeight: 1.15 }}
          >
            {audit.programName}
          </h2>
          <div className="mt-4 flex items-baseline gap-3">
            <span
              className="font-semibold text-[var(--color-fg-primary)]"
              style={{ fontSize: "var(--font-size-mc-display)", letterSpacing: "-0.025em" }}
            >
              {audit.totalMc.current} / {audit.totalMc.required} MC
            </span>
            <span className="text-[var(--font-size-body)] text-[var(--color-fg-tertiary)]">
              {pct}% to graduation
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-secondary)]">
            <div
              className={`h-full ${audit.willGraduate ? "bg-[var(--color-success)]" : "bg-[var(--color-warn)]"}`}
              style={{ width: `${pct}%`, transition: "width 600ms var(--ease-out)" }}
            />
          </div>
          {audit.willGraduate ? (
            <p className="mt-3 text-[var(--font-size-body)] font-medium text-[var(--color-success)]">
              On track to graduate.
            </p>
          ) : (
            <p className="mt-3 text-[var(--font-size-body)] text-[var(--color-fg-tertiary)]">
              {audit.blockers.length} bucket(s) remaining.
            </p>
          )}
        </Card>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {audit.buckets.map((b) => (
            <BucketCard key={b.id} bucket={b} />
          ))}
        </div>

        <ModuleTakingsEditor
          onChange={refetchAudit}
          buckets={audit.buckets.map((b) => ({ id: b.id, name: b.name }))}
        />
      </div>
    </Container>
  );
}
