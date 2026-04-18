"use client";

import { useEffect, useMemo, useState } from "react";

import { SyncButton } from "@/app/ui/sync-button";
import { HomeView } from "@/app/ui/dashboard/home-view";
import { ManageView } from "@/app/ui/dashboard/manage-view";
import { ModuleView } from "@/app/ui/dashboard/module-view";
import { ModulesView } from "@/app/ui/dashboard/modules-view";
import { NUSModsView } from "@/app/ui/dashboard/nusmods-view";
import type { DashboardData } from "@/lib/dashboard";

type RootView = "home" | "modules" | "nusmods" | "manage";

const NAV_ITEMS: Array<{ key: RootView; label: string; eyebrow: string; icon: string }> = [
  { key: "home", label: "Home", eyebrow: "Overview", icon: "⌂" },
  { key: "modules", label: "Modules", eyebrow: "Courses", icon: "◫" },
  { key: "nusmods", label: "NUSMods", eyebrow: "Schedule", icon: "◪" },
  { key: "manage", label: "Manage", eyebrow: "Control", icon: "◎" },
];

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-[12px] bg-[linear-gradient(135deg,#2563eb,#7c3aed_65%,#ec4899)] text-[11px] font-extrabold tracking-[0.16em] text-white shadow-[0_16px_30px_rgba(99,102,241,0.25)]">
        SD
      </div>
      <div>
        <p className="font-[var(--font-lora)] text-[24px] font-semibold tracking-[-0.03em] text-stone-950">Studex</p>
        <p className="text-[12px] text-stone-500">Student OS</p>
      </div>
    </div>
  );
}

function TopBar({
  rootView,
  activeModuleCode,
  lastSyncedAt,
}: {
  rootView: RootView;
  activeModuleCode: string | null;
  lastSyncedAt: string | null;
}) {
  const title =
    activeModuleCode
      ? activeModuleCode
      : rootView === "home"
        ? "Home"
        : rootView === "modules"
          ? "Modules"
          : rootView === "nusmods"
            ? "NUSMods"
            : "Manage";

  const subtitle =
    activeModuleCode
      ? "Module workspace"
      : rootView === "home"
        ? "Work, changes, and schedule."
        : rootView === "modules"
          ? "Course-centric workspaces."
          : rootView === "nusmods"
            ? "Timetable and exam context."
            : "Control which modules feed Studex.";

  return (
    <header className="sticky top-0 z-30 flex h-[54px] items-center justify-between gap-4 border-b border-stone-200 bg-[rgba(255,255,255,0.86)] px-4 backdrop-blur-xl sm:px-5">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">{subtitle}</p>
        <h1 className="truncate text-[15px] font-semibold text-stone-950">{title}</h1>
      </div>
      <div className="shrink-0">
        <SyncButton initialLastSyncedAt={lastSyncedAt} />
      </div>
    </header>
  );
}

function NavigationButton({
  item,
  active,
  onSelect,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={`flex w-full items-center gap-3 rounded-[10px] border px-3 py-3 text-left transition ${
        active
          ? "border-stone-300 bg-[#f5f5f4] text-stone-950"
          : "border-transparent bg-transparent text-stone-600 hover:border-stone-200 hover:bg-[#fafaf9]"
      }`}
    >
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-[11px] ${
          active ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-600"
        }`}
      >
        {item.icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium">{item.label}</span>
        <span className="block text-[11px] text-stone-400">{item.eyebrow}</span>
      </span>
    </button>
  );
}

export default function DashboardClient({ data: initialData }: { data: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [rootView, setRootView] = useState<RootView>("home");
  const [activeModuleCode, setActiveModuleCode] = useState<string | null>(null);
  const [seenAnnouncements, setSeenAnnouncements] = useState<Record<string, boolean>>({});
  const [pendingSyncModuleIds, setPendingSyncModuleIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  useEffect(() => {
    if (!activeModuleCode) {
      return;
    }

    const matchingModule = data.modules.find((module) => module.code === activeModuleCode);

    if (!matchingModule || !matchingModule.sync_enabled) {
      setActiveModuleCode(null);
    }
  }, [activeModuleCode, data.modules]);

  useEffect(() => {
    const validAnnouncementIds = new Set(
      data.latestChanges.filter((change) => change.kind === "announcement").map((change) => change.id),
    );

    setSeenAnnouncements((current) => {
      const nextEntries = Object.entries(current).filter(([id, seen]) => seen && validAnnouncementIds.has(id));

      if (nextEntries.length === Object.keys(current).length) {
        return current;
      }

      return Object.fromEntries(nextEntries);
    });
  }, [data.latestChanges]);

  const activeModule = useMemo(
    () => data.modules.find((module) => module.code === activeModuleCode) ?? null,
    [activeModuleCode, data.modules],
  );
  const syncedModules = useMemo(() => data.modules.filter((module) => module.sync_enabled), [data.modules]);
  const syncedModuleCodes = useMemo(() => new Set(syncedModules.map((module) => module.code)), [syncedModules]);
  const visibleOverview = useMemo(
    () => ({
      syncedModuleCount: syncedModules.length,
      openTaskCount: data.tasks.filter((task) => syncedModuleCodes.has(task.moduleCode)).length,
      recentChangeCount: data.latestChanges.filter((change) => syncedModuleCodes.has(change.moduleCode)).length,
      fileCount: data.recentFiles.filter((file) => syncedModuleCodes.has(file.moduleCode)).length,
      dueSoonCount: data.tasks.filter(
        (task) => syncedModuleCodes.has(task.moduleCode) && task.status === "due-soon",
      ).length,
      lastSyncedLabel: data.overview.lastSyncedLabel,
    }),
    [data.latestChanges, data.overview.lastSyncedLabel, data.recentFiles, data.tasks, syncedModuleCodes, syncedModules],
  );

  async function toggleSync(moduleId: string, enabled: boolean) {
    const currentModule = data.modules.find((module) => module.id === moduleId);

    if (!currentModule || pendingSyncModuleIds[moduleId]) {
      return;
    }

    const previousEnabled = currentModule.sync_enabled;

    setPendingSyncModuleIds((current) => ({ ...current, [moduleId]: true }));
    setData((current) => ({
      ...current,
      modules: current.modules.map((module) => (module.id === moduleId ? { ...module, sync_enabled: enabled } : module)),
    }));

    try {
      const response = await fetch("/api/modules/toggle-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, sync_enabled: enabled }),
      });

      if (!response.ok) {
        throw new Error("Failed to update module sync setting.");
      }
    } catch {
      setData((current) => ({
        ...current,
        modules: current.modules.map((module) => (module.id === moduleId ? { ...module, sync_enabled: previousEnabled } : module)),
      }));
    } finally {
      setPendingSyncModuleIds((current) => {
        const next = { ...current };
        delete next[moduleId];
        return next;
      });
    }
  }

  const content =
    data.status !== "ready" ? (
      <section className="rounded-[12px] border border-stone-200 bg-white px-6 py-8 shadow-[0_10px_28px_rgba(28,25,23,0.05)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">Setup status</p>
        <h2 className="mt-2 font-[var(--font-lora)] text-[28px] font-medium tracking-[-0.03em] text-stone-950">
          Studex needs one good sync to become useful.
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">{data.setupMessage}</p>
      </section>
    ) : activeModule ? (
      <ModuleView
        key={activeModule.code}
        module={activeModule}
        tasks={data.tasks.filter((task) => task.moduleCode === activeModule.code)}
        announcements={data.announcements.filter((announcement) => announcement.moduleCode === activeModule.code)}
        onBack={() => setActiveModuleCode(null)}
      />
    ) : rootView === "home" ? (
      <HomeView
        data={data}
        onOpenModule={(code) => setActiveModuleCode(code)}
        seenAnnouncements={seenAnnouncements}
        onMarkAnnouncementSeen={(id) => setSeenAnnouncements((current) => ({ ...current, [id]: true }))}
      />
    ) : rootView === "modules" ? (
      <ModulesView modules={data.modules} onOpenModule={(code) => setActiveModuleCode(code)} />
    ) : rootView === "nusmods" ? (
      <NUSModsView modules={data.modules} tasks={data.tasks} />
    ) : (
      <ManageView modules={data.modules} pendingSyncModuleIds={pendingSyncModuleIds} onToggleSync={toggleSync} />
    );

  return (
    <div className="min-h-screen bg-[#f7f6f3] px-3 py-3 text-stone-950 sm:px-4">
      <div className="pointer-events-none fixed left-[-120px] top-[-100px] h-[320px] w-[320px] rounded-full bg-blue-200/30 blur-[90px]" />
      <div className="pointer-events-none fixed bottom-[-120px] right-[-140px] h-[340px] w-[340px] rounded-full bg-violet-200/25 blur-[110px]" />

      <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-[1460px] overflow-hidden rounded-[28px] border border-stone-200 bg-[rgba(255,255,255,0.72)] shadow-[0_18px_44px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <aside className="hidden w-[252px] shrink-0 border-r border-stone-200 bg-[rgba(255,255,255,0.78)] px-4 py-4 lg:flex lg:flex-col">
          <Brand />

          <div className="mt-8">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">Navigation</p>
            <nav aria-label="Desktop navigation" className="space-y-1.5">
              {NAV_ITEMS.map((item) => (
                <NavigationButton
                  key={item.key}
                  item={item}
                  active={rootView === item.key && !activeModule}
                  onSelect={() => {
                    setRootView(item.key);
                    setActiveModuleCode(null);
                  }}
                />
              ))}
            </nav>
          </div>

          <div className="mt-auto rounded-[12px] border border-stone-200 bg-[#fcfbf9] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">Workspace</p>
            <div className="mt-4 space-y-3">
              <div>
                <p className="font-[var(--font-lora)] text-2xl font-semibold text-stone-950">{visibleOverview.syncedModuleCount}</p>
                <p className="text-[11px] text-stone-500">synced modules</p>
              </div>
              <div>
                <p className="font-[var(--font-lora)] text-2xl font-semibold text-stone-950">{visibleOverview.openTaskCount}</p>
                <p className="text-[11px] text-stone-500">open tasks</p>
              </div>
              <div>
                <p className="text-[11px] text-stone-500">Last sync {visibleOverview.lastSyncedLabel}</p>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-stone-200 bg-[rgba(255,255,255,0.86)] px-4 py-3 lg:hidden">
            <Brand />
          </div>

          <TopBar rootView={rootView} activeModuleCode={activeModuleCode} lastSyncedAt={data.lastSyncedAt} />

          <main className="flex-1 px-4 py-4 pb-24 sm:px-5 lg:px-6 lg:pb-6">{content}</main>
        </div>
      </div>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex items-center border-t border-stone-200 bg-[rgba(255,255,255,0.95)] px-2 py-2 backdrop-blur-xl lg:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const active = rootView === item.key && !activeModule;

          return (
            <button
              key={item.key}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => {
                setRootView(item.key);
                setActiveModuleCode(null);
              }}
              className="flex min-w-0 flex-1 flex-col items-center gap-1 py-1 text-center"
            >
              <span
                className={`grid h-8 w-8 place-items-center rounded-full text-[11px] ${
                  active ? "bg-stone-950 text-white" : "bg-stone-100 text-stone-500"
                }`}
              >
                {item.icon}
              </span>
              <span className={`truncate text-[11px] ${active ? "font-semibold text-stone-950" : "text-stone-500"}`}>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
