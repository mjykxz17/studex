import type { ModuleSummary } from "@/lib/dashboard";

import { colorForModule, EmptyState, Pill, SectionCard } from "./shared";

export function ManageView({
  modules,
  pendingSyncModuleIds,
  onToggleSync,
}: {
  modules: ModuleSummary[];
  pendingSyncModuleIds: Record<string, boolean>;
  onToggleSync: (moduleId: string, enabled: boolean) => void;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-[12px] border border-stone-200 bg-white px-5 py-5 shadow-[0_10px_28px_rgba(28,25,23,0.05)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">Manage</p>
        <h1 className="mt-2 font-[var(--font-lora)] text-[28px] font-medium tracking-[-0.03em] text-stone-950">Control what powers the workspace.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-500">
          Enable only the modules you want in the command board, module workspace views, and file listings.
        </p>
      </section>

      <SectionCard title="Module sync control" eyebrow="Enable or mute courses">
        {modules.length === 0 ? (
          <EmptyState title="No modules discovered" copy="Run discovery from Sync Canvas to populate the module list." />
        ) : (
          <div className="space-y-3">
            {modules.map((module) => (
              <div key={module.id} className="flex flex-col gap-4 rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold tracking-[0.18em]" style={{ color: colorForModule(module.code) }}>
                      {module.code}
                    </span>
                    <Pill tone={module.sync_enabled ? "emerald" : "slate"}>{module.sync_enabled ? "Enabled" : "Muted"}</Pill>
                    {pendingSyncModuleIds[module.id] ? <Pill tone="blue">Updating</Pill> : null}
                    <Pill>{module.lastSyncLabel}</Pill>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-stone-900">{module.title}</p>
                  <p className="mt-1 text-sm text-stone-500">
                    {module.taskCount} tasks · {module.announcementCount} updates · {module.files.length} files
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleSync(module.id, !module.sync_enabled)}
                  disabled={pendingSyncModuleIds[module.id]}
                  aria-label={`${module.sync_enabled ? "Disable" : "Enable"} sync for ${module.code}`}
                  aria-busy={pendingSyncModuleIds[module.id] ? "true" : undefined}
                  className={`relative h-7 w-14 rounded-full transition-colors ${module.sync_enabled ? "bg-stone-900" : "bg-stone-300"}`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${module.sync_enabled ? "left-8" : "left-1"} ${
                      pendingSyncModuleIds[module.id] ? "opacity-70" : ""
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
