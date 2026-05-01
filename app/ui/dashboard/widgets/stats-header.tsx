"use client";

import { Card } from "@/app/ui/primitives/card";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  return "Good evening.";
}

function formatTodayLabel() {
  return new Intl.DateTimeFormat("en-SG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export function StatsHeader({
  dueSoonCount,
  openTaskCount,
  unreadAnnouncementCount,
}: {
  dueSoonCount: number;
  openTaskCount: number;
  unreadAnnouncementCount: number;
}) {
  return (
    <section className="rounded-[12px] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] px-5 py-5 shadow-[0_10px_28px_rgba(28,25,23,0.05)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-fg-tertiary)]">Home</p>
          <h1 className="mt-2 font-[var(--font-lora)] text-[28px] font-medium tracking-[-0.03em] text-[var(--color-fg-primary)]">
            {getGreeting()}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-tertiary)]">{formatTodayLabel()} · live Canvas workspace</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-[320px]">
          <StatCard value={dueSoonCount} label="Due soon" accent={dueSoonCount > 0 ? "#dc2626" : "#a8a29e"} />
          <StatCard value={openTaskCount} label="Open tasks" accent="#d97706" />
          <StatCard value={unreadAnnouncementCount} label="Changes" accent="#2563eb" />
        </div>
      </div>
    </section>
  );
}

function StatCard({ value, label, accent }: { value: number; label: string; accent: string }) {
  return (
    <Card className="text-center">
      <p className="font-[var(--font-lora)] text-2xl font-semibold leading-none" style={{ color: accent }}>
        {value}
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-[var(--color-fg-tertiary)]">{label}</p>
    </Card>
  );
}
