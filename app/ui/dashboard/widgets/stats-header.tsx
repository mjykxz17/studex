"use client";

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
    <section className="rounded-[12px] border border-stone-200 bg-white px-5 py-5 shadow-[0_10px_28px_rgba(28,25,23,0.05)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">Home</p>
          <h1 className="mt-2 font-[var(--font-lora)] text-[28px] font-medium tracking-[-0.03em] text-stone-950">
            {getGreeting()}
          </h1>
          <p className="mt-1 text-sm text-stone-500">{formatTodayLabel()} · live Canvas workspace</p>
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
    <div className="rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-4 py-3 text-center">
      <p className="font-[var(--font-lora)] text-2xl font-semibold leading-none" style={{ color: accent }}>
        {value}
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-stone-400">{label}</p>
    </div>
  );
}
